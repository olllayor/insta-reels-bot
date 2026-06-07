// Proxy manager with latency-based selection, per-proxy health state, and periodic health checks.
import * as fs from 'fs';
import * as path from 'path';

export interface ProxyConfig {
	host: string;
	port: number;
	auth?: {
		username: string;
		password: string;
	};
	protocol?: 'http' | 'https';
}

interface ProxyEntry {
	proxy: string;
	protocol: string;
	ip: string;
	port: number;
	https: boolean;
	anonymity: string;
	score: number;
	geolocation: {
		country: string;
		city: string;
	};
}

export type ProxyState = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface ProxyHealth {
	state: ProxyState;
	latencyMs: number;
	lastCheckAt: number;
	consecutiveFailures: number;
	cooldownUntil: number;
	totalChecks: number;
	totalSuccesses: number;
}

const HEALTHY: ProxyHealth = {
	state: 'unknown',
	latencyMs: Infinity,
	lastCheckAt: 0,
	consecutiveFailures: 0,
	cooldownUntil: 0,
	totalChecks: 0,
	totalSuccesses: 0,
};

const BACKOFF_SCHEDULE_MS = [10_000, 30_000, 60_000, 120_000, 300_000, 600_000];

const computeCooldownMs = (consecutiveFailures: number): number => {
	const idx = Math.min(consecutiveFailures - 1, BACKOFF_SCHEDULE_MS.length - 1);
	return BACKOFF_SCHEDULE_MS[Math.max(0, idx)] ?? 600_000;
};

const updateRollingLatency = (current: number, sample: number): number => {
	if (!Number.isFinite(current)) return sample;
	// EMA with alpha=0.3 — leans toward recent samples but smooths spikes.
	return Math.round(current * 0.7 + sample * 0.3);
};

const classifyByLatency = (latencyMs: number): ProxyState => {
	if (!Number.isFinite(latencyMs)) return 'unknown';
	if (latencyMs < 1500) return 'healthy';
	if (latencyMs < 4000) return 'degraded';
	return 'unhealthy';
};

export class ProxyManager {
	private proxies: ProxyConfig[] = [];
	private health: Map<string, ProxyHealth> = new Map();
	private healthCheckerTimer: ReturnType<typeof setInterval> | null = null;
	private healthCheckerRunning = false;
	private readonly healthCheckEndpoint: string;
	private readonly healthCheckTimeoutMs: number;
	private readonly healthCheckConcurrency: number;

	constructor(proxyList?: ProxyConfig[], options?: { healthCheckEndpoint?: string }) {
		if (proxyList && proxyList.length > 0) {
			this.proxies = proxyList;
		} else {
			if (!this.loadFromJsonFile()) {
				this.loadFromEnv();
			}
		}
		this.healthCheckEndpoint =
			options?.healthCheckEndpoint || process.env.PROXY_HEALTHCHECK_PROBE_URL || '';
		this.healthCheckTimeoutMs = Math.max(
			500,
			Number(process.env.PROXY_HEALTHCHECK_TIMEOUT_MS || 3_000),
		);
		this.healthCheckConcurrency = Math.max(
			1,
			Number(process.env.PROXY_HEALTHCHECK_CONCURRENCY || 10),
		);
	}

	private proxyKey(proxy: ProxyConfig): string {
		return `${proxy.host}:${proxy.port}`;
	}

	private getHealth(proxy: ProxyConfig): ProxyHealth {
		const key = this.proxyKey(proxy);
		let h = this.health.get(key);
		if (!h) {
			h = { ...HEALTHY };
			this.health.set(key, h);
		}
		return h;
	}

	private setHealth(proxy: ProxyConfig, patch: Partial<ProxyHealth>) {
		const key = this.proxyKey(proxy);
		const current = this.getHealth(proxy);
		this.health.set(key, { ...current, ...patch });
	}

	private loadFromJsonFile(): boolean {
		try {
			const jsonPath = path.join(process.cwd(), 'proxies.json');
			if (!fs.existsSync(jsonPath)) {
				return false;
			}

			const content = fs.readFileSync(jsonPath, 'utf-8');
			const entries: ProxyEntry[] = JSON.parse(content);

			for (const entry of entries) {
				try {
					const parsed = this.parseProxyEntry(entry);
					if (parsed) {
						this.proxies.push(parsed);
					}
				} catch (err) {
					console.warn(`Failed to parse proxy entry: ${entry.proxy}`, err);
				}
			}

			if (this.proxies.length > 0) {
				console.log(`✅ Loaded ${this.proxies.length} proxies from proxies.json`);
				return true;
			}

			return false;
		} catch (err) {
			console.warn('Failed to load proxies from proxies.json:', err);
			return false;
		}
	}

	private parseProxyEntry(entry: ProxyEntry): ProxyConfig | null {
		try {
			const host = entry.ip;
			const port = entry.port;
			const protocol = entry.protocol as 'http' | 'https';

			if (!host || !port) {
				return null;
			}

			return {
				protocol,
				host,
				port,
			};
		} catch {
			return null;
		}
	}

	private loadFromEnv(): void {
		const proxyEnv = process.env.PROXY_LIST || '';
		if (!proxyEnv.trim()) {
			return;
		}

		const proxyStrings = proxyEnv.split(',').map((p) => p.trim());
		for (const proxyStr of proxyStrings) {
			try {
				const parsed = this.parseProxyUrl(proxyStr);
				if (parsed) {
					this.proxies.push(parsed);
				}
			} catch (err) {
				console.warn(`Failed to parse proxy: ${proxyStr}`, err);
			}
		}

		if (this.proxies.length > 0) {
			console.log(`✅ Loaded ${this.proxies.length} static proxies from PROXY_LIST`);
		}
	}

	private parseProxyUrl(url: string): ProxyConfig | null {
		try {
			const match = url.match(/^(https?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)$/);
			if (!match) {
				return null;
			}

			const [, protocol, username, password, host, port] = match;

			if (!host || !port) {
				return null;
			}

			return {
				protocol: protocol as 'http' | 'https',
				host,
				port: parseInt(port, 10),
				...(username && password && { auth: { username, password } }),
			};
		} catch {
			return null;
		}
	}

	/**
	 * Select the next proxy using latency-based ordering among healthy/degraded proxies.
	 * Proxies in cooldown are skipped. Falls back to round-robin if no healthy proxy is known yet.
	 */
	public getNextProxy(): Promise<ProxyConfig | null> {
		if (this.proxies.length === 0) {
			return Promise.resolve(null);
		}

		const now = Date.now();
		const candidates: Array<{ proxy: ProxyConfig; health: ProxyHealth }> = [];

		for (const proxy of this.proxies) {
			const h = this.getHealth(proxy);
			if (h.cooldownUntil > now) continue;
			if (h.state === 'unhealthy') continue;
			candidates.push({ proxy, health: h });
		}

		if (candidates.length > 0) {
			// Sort by latency (asc); unknowns go last (Infinity).
			candidates.sort((a, b) => a.health.latencyMs - b.health.latencyMs);
			const first = candidates[0];
			if (first) {
				return Promise.resolve(first.proxy);
			}
		}

		// All proxies in cooldown/unhealthy — reset the oldest cooldown and try it.
		let oldest: { proxy: ProxyConfig; health: ProxyHealth } | null = null;
		for (const proxy of this.proxies) {
			const h = this.getHealth(proxy);
			if (!oldest || h.cooldownUntil < oldest.health.cooldownUntil) {
				oldest = { proxy, health: h };
			}
		}
		if (oldest) {
			console.warn('⚠️ All proxies unhealthy/in cooldown; sampling oldest cooldown for recovery probe');
			return Promise.resolve(oldest.proxy);
		}
		return Promise.resolve(null);
	}

	/**
	 * Mark a proxy as successful. Resets failure streak and updates latency.
	 */
	public markSuccess(proxy: ProxyConfig, latencyMs?: number): void {
		const sample = typeof latencyMs === 'number' && Number.isFinite(latencyMs) ? latencyMs : 0;
		const h = this.getHealth(proxy);
		this.setHealth(proxy, {
			state: sample > 0 ? classifyByLatency(sample) : 'healthy',
			latencyMs: sample > 0 ? updateRollingLatency(h.latencyMs, sample) : h.latencyMs,
			lastCheckAt: Date.now(),
			consecutiveFailures: 0,
			cooldownUntil: 0,
			totalChecks: h.totalChecks + 1,
			totalSuccesses: h.totalSuccesses + 1,
		});
	}

	/**
	 * Mark a proxy as failed. Applies exponential cooldown and reclassifies state.
	 */
	public markFailed(proxy: ProxyConfig, latencyMs?: number): void {
		const h = this.getHealth(proxy);
		const failures = h.consecutiveFailures + 1;
		const cooldownMs = computeCooldownMs(failures);
		const sample = typeof latencyMs === 'number' && Number.isFinite(latencyMs) ? latencyMs : h.latencyMs;
		this.setHealth(proxy, {
			state: 'unhealthy',
			latencyMs: sample,
			lastCheckAt: Date.now(),
			consecutiveFailures: failures,
			cooldownUntil: Date.now() + cooldownMs,
			totalChecks: h.totalChecks + 1,
		});
		console.warn(
			`⚠️ Proxy marked as failed: ${proxy.host}:${proxy.port} (failures=${failures}, cooldown=${Math.round(cooldownMs / 1000)}s)`,
		);
	}

	public getProxies(): ProxyConfig[] {
		return [...this.proxies];
	}

	public hasProxies(): boolean {
		return this.proxies.length > 0;
	}

	public getProxyUrl(proxy: ProxyConfig): string {
		const protocol = proxy.protocol || 'http';
		const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : '';
		return `${protocol}://${auth}${proxy.host}:${proxy.port}`;
	}

	public getHealthSnapshot(): Array<{ proxy: string; health: ProxyHealth }> {
		return this.proxies.map((p) => ({ proxy: this.proxyKey(p), health: { ...this.getHealth(p) } }));
	}

	/**
	 * Probe a single proxy through the configured endpoint (or via TCP connect if none).
	 * Returns latency in ms, or null on failure.
	 */
	private async probeProxy(proxy: ProxyConfig): Promise<{ ok: boolean; latencyMs: number }> {
		const proxyUrl = this.getProxyUrl(proxy);
		const started = performance.now();
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), this.healthCheckTimeoutMs);
			try {
				if (this.healthCheckEndpoint) {
					const res = await fetch(this.healthCheckEndpoint, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
						body: JSON.stringify({ url: 'https://www.google.com/', videoQuality: 'max' }),
						signal: controller.signal,
						proxy: proxyUrl,
					} as RequestInit);
					const elapsed = Math.round(performance.now() - started);
					// Even 4xx counts as "endpoint reachable" for health-check purposes.
					// We only flag unhealthy on network/abort/5xx-timeout.
					if (res.status >= 500) return { ok: false, latencyMs: elapsed };
					return { ok: true, latencyMs: elapsed };
				} else {
					// No endpoint configured: fall back to TCP connect to the proxy.
					const { host, port } = proxy;
					const net = await import('net');
					const sock = net.createConnection({ host, port });
					const cleanup = () => {
						sock.destroy();
						clearTimeout(timeout);
					};
					const ok = await new Promise<boolean>((resolve) => {
						const onDone = (success: boolean) => {
							cleanup();
							resolve(success);
						};
						sock.once('connect', () => onDone(true));
						sock.once('error', () => onDone(false));
						sock.setTimeout(this.healthCheckTimeoutMs, () => onDone(false));
					});
					const elapsed = Math.round(performance.now() - started);
					return { ok, latencyMs: elapsed };
				}
			} finally {
				clearTimeout(timeout);
			}
		} catch {
			const elapsed = Math.round(performance.now() - started);
			return { ok: false, latencyMs: elapsed };
		}
	}

	/**
	 * Run a single health-check pass over all proxies with bounded concurrency.
	 * Updates health state for each proxy.
	 */
	public async runHealthCheckPass(): Promise<void> {
		if (this.proxies.length === 0) return;
		const queue = [...this.proxies];
		const workers: Array<Promise<void>> = [];
		for (let i = 0; i < this.healthCheckConcurrency; i++) {
			workers.push(
				(async () => {
					while (queue.length > 0) {
						const proxy = queue.shift();
						if (!proxy) return;
						const result = await this.probeProxy(proxy);
						if (result.ok) {
							this.markSuccess(proxy, result.latencyMs);
						} else {
							this.markFailed(proxy, result.latencyMs);
						}
					}
				})(),
			);
		}
		await Promise.all(workers);
	}

	/**
	 * Start the periodic health checker. Returns a stop function.
	 */
	public startHealthChecker(intervalMs?: number): () => void {
		const interval = Math.max(5_000, Number(intervalMs || process.env.PROXY_HEALTHCHECK_INTERVAL_MS || 60_000));
		if (this.healthCheckerTimer) {
			clearInterval(this.healthCheckerTimer);
		}
		const tick = async () => {
			if (this.healthCheckerRunning) return;
			this.healthCheckerRunning = true;
			try {
				await this.runHealthCheckPass();
			} catch (e) {
				console.warn('[proxy] health-check pass error:', e);
			} finally {
				this.healthCheckerRunning = false;
			}
		};
		// Prime a non-blocking pass so first real request benefits from a warmup.
		tick().catch(() => undefined);
		this.healthCheckerTimer = setInterval(tick, interval);
		if (typeof this.healthCheckerTimer === 'object' && this.healthCheckerTimer && 'unref' in this.healthCheckerTimer) {
			(this.healthCheckerTimer as NodeJS.Timeout).unref?.();
		}
		return () => this.stopHealthChecker();
	}

	public stopHealthChecker(): void {
		if (this.healthCheckerTimer) {
			clearInterval(this.healthCheckerTimer);
			this.healthCheckerTimer = null;
		}
	}
}

// Global singleton instance
let globalProxyManager: ProxyManager | null = null;

export const getProxyManager = (): ProxyManager => {
	if (!globalProxyManager) {
		globalProxyManager = new ProxyManager();
	}
	return globalProxyManager;
};

export const setProxyManager = (manager: ProxyManager): void => {
	globalProxyManager = manager;
};
