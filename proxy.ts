// Proxy manager using static proxy list from proxies.json
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

/**
 * Proxy JSON file entry type
 */
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

/**
 * Proxy manager with support for:
 * 1. Static proxy list from proxies.json file
 * 2. Environment variable PROXY_LIST
 * 3. No proxy (fallback)
 */
export class ProxyManager {
	private proxies: ProxyConfig[] = [];
	private currentIndex = 0;
	private failedProxies: Set<string> = new Set();

	constructor(proxyList?: ProxyConfig[]) {
		if (proxyList && proxyList.length > 0) {
			this.proxies = proxyList;
		} else {
			// Try to load from proxies.json first
			if (!this.loadFromJsonFile()) {
				// Fallback to environment variable
				this.loadFromEnv();
			}
		}
	}

	/**
	 * Load proxies from proxies.json file
	 */
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

	/**
	 * Parse proxy entry from JSON file
	 */
	private parseProxyEntry(entry: ProxyEntry): ProxyConfig | null {
		try {
			// Extract host and port from the proxy URL or directly from entry
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

	/**
	 * Load proxies from environment variable
	 * Format: PROXY_LIST="http://user:pass@host1:port1,http://host2:port2"
	 */
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

	/**
	 * Parse proxy URL format: http://[user:pass@]host:port
	 */
	private parseProxyUrl(url: string): ProxyConfig | null {
		try {
			// Handle format: http://user:pass@host:port or http://host:port
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
	 * Fetch a proxy from Proxifly API
	 */
	private async fetchFromProxifly(): Promise<ProxyConfig | null> {
		return null; // No longer using API
	}

	/**
	 * Get the next proxy in rotation, skipping failed ones
	 */
	public async getNextProxy(): Promise<ProxyConfig | null> {
		if (this.proxies.length === 0) {
			return null;
		}

		// Try to find a non-failed proxy
		let attempts = 0;
		while (attempts < this.proxies.length) {
			const proxy = this.proxies[this.currentIndex];
			if (!proxy) {
				return null;
			}

			this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

			const proxyKey = `${proxy.host}:${proxy.port}`;
			if (!this.failedProxies.has(proxyKey)) {
				return proxy;
			}

			attempts++;
		}

		// All proxies have failed, reset and return the first one
		if (this.failedProxies.size === this.proxies.length) {
			console.warn('⚠️ All static proxies are marked as failed. Resetting...');
			this.failedProxies.clear();
			this.currentIndex = 0;
			const firstProxy = this.proxies[0];
			return firstProxy || null;
		}

		return null;
	}

	/**
	 * Mark a proxy as failed (temporarily skip it)
	 */
	public markFailed(proxy: ProxyConfig): void {
		const proxyKey = `${proxy.host}:${proxy.port}`;
		this.failedProxies.add(proxyKey);
		console.warn(`⚠️ Proxy marked as failed: ${proxyKey}`);
	}

	/**
	 * Mark a proxy as successful (remove from failed list)
	 */
	public markSuccess(proxy: ProxyConfig): void {
		const proxyKey = `${proxy.host}:${proxy.port}`;
		this.failedProxies.delete(proxyKey);
	}

	/**
	 * Get current proxy list (for debugging)
	 */
	public getProxies(): ProxyConfig[] {
		return [...this.proxies];
	}

	/**
	 * Check if any proxies are configured
	 */
	public hasProxies(): boolean {
		return this.proxies.length > 0;
	}

	/**
	 * Check if using Proxifly (deprecated - no longer used)
	 */
	public isUsingProxifly(): boolean {
		return false;
	}

	/**
	 * Get proxy URL for constructing proxy-compatible fetch URLs
	 */
	public getProxyUrl(proxy: ProxyConfig): string {
		const protocol = proxy.protocol || 'http';
		const auth = proxy.auth ? `${proxy.auth.username}:${proxy.auth.password}@` : '';
		return `${protocol}://${auth}${proxy.host}:${proxy.port}`;
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
