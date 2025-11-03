import { getProxyManager } from './proxy.js';

export interface DownloaderSuccessResponseMinimal {
	success: true;
	url: string; // direct video URL
	elapsedMs: number; // round-trip time
}

export interface DownloaderErrorResponseMinimal {
	success: false;
	error: string;
	elapsedMs: number;
}

export type DownloaderResponse = DownloaderSuccessResponseMinimal | DownloaderErrorResponseMinimal;

// NOTE: Node.js 18+ fetch uses HTTP keep-alive by default, automatically reusing TCP connections
// for requests to the same host. This eliminates TCP handshake overhead (~100-200ms per request).
// No explicit agent configuration needed; connections are pooled transparently.

// Performs the POST call to cobalt endpoint and returns a typed / validated response
export const downloadInstagramContent = async (mediaUrl: string): Promise<DownloaderResponse> => {
	// Prefer env but default to cobalt for convenience
	const endpoint = process.env.API_ENDPOINT || 'https://cobalt.ollayor.uz/';
	const timeoutMs = Number(process.env.DOWNLOADER_TIMEOUT_MS || 20000);

	const proxyManager = getProxyManager();
	let proxy = null;
	let proxyUrl: string | null = null;

	// Get proxy if available
	if (proxyManager.hasProxies()) {
		proxy = await proxyManager.getNextProxy();
		if (proxy) {
			proxyUrl = proxyManager.getProxyUrl(proxy);
			console.log(`🔄 Using proxy: ${proxy.host}:${proxy.port}`);
		}
	}

	try {
		const started = performance.now();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		// Build headers with proxy information if available
		const headers: any = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		};

		// If using a proxy, set it via headers/environment
		// Note: Node.js fetch will use http_proxy/https_proxy env vars automatically
		if (proxyUrl) {
			// Set proxy environment variables for this request context
			process.env.http_proxy = proxyUrl;
			process.env.https_proxy = proxyUrl;
		}

		const result = await fetch(endpoint, {
			method: 'POST',
			headers,
			// cobalt expects { url, videoQuality? } where videoQuality only accepts "max" currently
			body: JSON.stringify({ url: mediaUrl, videoQuality: 'max' }),
			signal: controller.signal,
		});
		clearTimeout(timeout);

		// Clear proxy env vars
		delete process.env.http_proxy;
		delete process.env.https_proxy;

		// Mark proxy as successful if used
		if (proxy) {
			proxyManager.markSuccess(proxy);
		}

		if (!result.ok) {
			const elapsedMs = Math.round(performance.now() - started);
			// Try to get detailed error from server response
			let errorDetail = `HTTP ${result.status}`;
			try {
				const errorBody = await result.text();
				const parsed = JSON.parse(errorBody);
				errorDetail = (typeof parsed?.error === 'string' ? parsed.error : String(parsed?.error?.code)) || errorDetail;
			} catch {
				// fallback to status code
			}
			return { success: false, error: `Server error: ${errorDetail}`, elapsedMs };
		}

		let json: any;
		try {
			json = await result.json();
		} catch (parseErr) {
			const elapsedMs = Math.round(performance.now() - started);
			return { success: false, error: 'Invalid JSON from API', elapsedMs };
		}

		const elapsedMs = Math.round(performance.now() - started);

		// cobalt: { status: 'redirect' | 'success' | 'error', url?, filename?, error? }
		if (typeof json === 'object' && json) {
			if ((json.status === 'redirect' || json.status === 'success') && typeof json.url === 'string') {
				return { success: true, url: json.url, elapsedMs };
			}
			if (json.status === 'error') {
				const err = typeof json.error === 'string' ? json.error : json.error?.code || 'Unknown API error';
				return { success: false, error: String(err), elapsedMs };
			}
			// legacy support
			if (json.downloadUrl) return { success: true, url: json.downloadUrl, elapsedMs };
			if (json.url) return { success: true, url: json.url, elapsedMs };
		}
		return { success: false, error: 'Unknown API response', elapsedMs };
	} catch (err: any) {
		// Clear proxy env vars on error
		delete process.env.http_proxy;
		delete process.env.https_proxy;

		const elapsedMs = 0; // unknown (failed early)

		// Mark proxy as failed if used
		if (proxy) {
			proxyManager.markFailed(proxy);
			console.warn(`⚠️ Proxy failed, marking as bad: ${proxy.host}:${proxy.port}`);
		}

		if (err?.name === 'AbortError') {
			return { success: false, error: 'Request timed out', elapsedMs };
		}
		console.error('Download failed:', err);
		return { success: false, error: 'Internal fetch error', elapsedMs };
	}
};
