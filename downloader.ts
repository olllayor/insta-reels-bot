import { getProxyManager } from './proxy.ts';
import { CircuitOpenError, getCobaltCircuitBreaker } from './circuitBreaker.ts';

export interface DownloaderSuccessResponseMinimal {
	success: true;
	url: string;
	elapsedMs: number;
}

export interface DownloaderErrorResponseMinimal {
	success: false;
	error: string;
	elapsedMs: number;
	code?: string;
}

export const isCircuitOpenError = (msg: string): boolean => msg.startsWith('circuit_open:');

const formatCircuitOpenMessage = (e: CircuitOpenError): string =>
	`circuit_open:${e.breakerName}:${Math.round(e.retryAfterMs / 1000)}`;

export type DownloaderResponse = DownloaderSuccessResponseMinimal | DownloaderErrorResponseMinimal;

export const downloadInstagramContent = async (mediaUrl: string): Promise<DownloaderResponse> => {
	const endpoint = process.env.API_ENDPOINT || 'https://cobalt.ollayor.uz/';
	const timeoutMs = Number(process.env.DOWNLOADER_TIMEOUT_MS || 20000);
	const started = performance.now();
	const breaker = getCobaltCircuitBreaker();

	return breaker.execute(async (): Promise<DownloaderResponse> => {
		const proxyManager = getProxyManager();
		let proxy = null;
		let proxyUrl: string | null = null;

		const isLocalOrPrivateEndpoint = (() => {
			try {
				const { hostname } = new URL(endpoint);
				return (
					hostname === 'localhost' ||
					hostname === '127.0.0.1' ||
					hostname === '::1' ||
					hostname === 'cobalt-api' ||
					hostname.endsWith('.local') ||
					hostname.endsWith('.internal') ||
					/^10\./.test(hostname) ||
					/^192\.168\./.test(hostname) ||
					/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
				);
			} catch {
				return false;
			}
		})();

		if (proxyManager.hasProxies() && !isLocalOrPrivateEndpoint) {
			// Proxy usage is opt-in. Without USE_PROXIES=true, we never route through
			// a proxy — even if proxies are loaded — because a stale/dead proxy list
			// will silently break downloads (the proxies connect fine but the public
			// endpoint refuses their IP, leading to ECONNRESET). Local environments
			// pointing at a public endpoint must NOT use proxies by default.
			const useProxies = process.env.USE_PROXIES === 'true' || process.env.USE_PROXIES === '1';
			if (useProxies) {
				proxy = await proxyManager.getNextProxy();
				if (proxy) {
					proxyUrl = proxyManager.getProxyUrl(proxy);
					console.log(`🔄 Using proxy: ${proxy.host}:${proxy.port}`);
				}
			} else {
				console.log('ℹ️ Proxies loaded but USE_PROXIES is not set; calling API directly');
			}
		} else if (proxyManager.hasProxies() && isLocalOrPrivateEndpoint) {
			console.log('ℹ️ Skipping proxy for local/private API endpoint');
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		};

		// Cobalt's current public API (api.cobalt.tools) requires JWT auth.
		// If the key is configured, send it as a Bearer token. The header is
		// omitted entirely for self-hosted cobalt instances that don't need it.
		const cobaltApiKey = process.env.COBALT_API_KEY;
		if (cobaltApiKey) {
			headers['Authorization'] = `Bearer ${cobaltApiKey}`;
		}

		const requestInit: RequestInit & { proxy?: string } = {
			method: 'POST',
			headers,
			body: JSON.stringify({ url: mediaUrl, videoQuality: 'max' }),
			signal: controller.signal,
		};

		if (proxyUrl) {
			requestInit.proxy = proxyUrl;
		}

		try {
			let result: Response;
			try {
				result = await fetch(endpoint, requestInit as RequestInit);
			} finally {
				clearTimeout(timeout);
			}

			const elapsedMs = Math.round(performance.now() - started);

			if (proxy) {
				proxyManager.markSuccess(proxy, elapsedMs);
			}

			if (!result.ok) {
				let errorDetail = `HTTP ${result.status}`;
				try {
					const errorBody = await result.text();
					const parsed = JSON.parse(errorBody);
					errorDetail = (typeof parsed?.error === 'string' ? parsed.error : String(parsed?.error?.code)) || errorDetail;
				} catch {
					// keep default
				}
				// Treat 5xx as a server-side failure (breaker should count).
				if (result.status >= 500) {
					return {
						success: false,
						error: `Server error: ${errorDetail}`,
						elapsedMs,
						code: 'server_5xx',
					};
				}
				return { success: false, error: `Server error: ${errorDetail}`, elapsedMs };
			}

			let json: any;
			try {
				json = await result.json();
			} catch {
				return { success: false, error: 'Invalid JSON from API', elapsedMs };
			}

			if (typeof json === 'object' && json) {
				if (
					(json.status === 'redirect' || json.status === 'success' || json.status === 'tunnel' || json.status === 'stream') &&
					typeof json.url === 'string'
				) {
					return { success: true, url: json.url, elapsedMs };
				}
				if (json.status === 'error') {
					const err = typeof json.error === 'string' ? json.error : json.error?.code || 'Unknown API error';
					return { success: false, error: String(err), elapsedMs };
				}
				if (json.downloadUrl) return { success: true, url: json.downloadUrl, elapsedMs };
				if (json.url) return { success: true, url: json.url, elapsedMs };
			}
			return { success: false, error: 'Unknown API response', elapsedMs };
		} catch (err: any) {
			const elapsedMs = Math.round(performance.now() - started);

			if (proxy) {
				proxyManager.markFailed(proxy, elapsedMs);
				console.warn(`⚠️ Proxy failed, marking as bad: ${proxy.host}:${proxy.port}`);
			}

			if (err?.name === 'AbortError') {
				return { success: false, error: 'Request timed out', elapsedMs, code: 'timeout' };
			}
			console.error('Download failed:', err);
			return { success: false, error: 'Internal fetch error', elapsedMs, code: 'fetch_error' };
		}
	}).catch((err: unknown) => {
		if (err instanceof CircuitOpenError) {
			return {
				success: false,
				error: formatCircuitOpenMessage(err),
				elapsedMs: Math.round(performance.now() - started),
				code: 'circuit_open',
			} as DownloaderResponse;
		}
		throw err;
	});
};
