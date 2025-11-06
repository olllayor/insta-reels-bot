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

export const downloadInstagramContent = async (mediaUrl: string): Promise<DownloaderResponse> => {
	const endpoint = process.env.API_ENDPOINT || 'https://cobalt.ollayor.uz/';
	const timeoutMs = Number(process.env.DOWNLOADER_TIMEOUT_MS || 20000);

	const proxyManager = getProxyManager();
	let proxy = null;
	let proxyUrl: string | null = null;

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

		const headers: any = {
			'Content-Type': 'application/json',
			Accept: 'application/json',
		};

		if (proxyUrl) {
			process.env.http_proxy = proxyUrl;
			process.env.https_proxy = proxyUrl;
		}

		const result = await fetch(endpoint, {
			method: 'POST',
			headers,
			body: JSON.stringify({ url: mediaUrl, videoQuality: 'max' }),
			signal: controller.signal,
		});
		clearTimeout(timeout);

		delete process.env.http_proxy;
		delete process.env.https_proxy;

		if (proxy) {
			proxyManager.markSuccess(proxy);
		}

		if (!result.ok) {
			const elapsedMs = Math.round(performance.now() - started);
			let errorDetail = `HTTP ${result.status}`;
			try {
				const errorBody = await result.text();
				const parsed = JSON.parse(errorBody);
				errorDetail = (typeof parsed?.error === 'string' ? parsed.error : String(parsed?.error?.code)) || errorDetail;
			} catch {
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

		if (typeof json === 'object' && json) {
			if ((json.status === 'redirect' || json.status === 'success') && typeof json.url === 'string') {
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
		delete process.env.http_proxy;
		delete process.env.https_proxy;

		const elapsedMs = 0; // unknown (failed early)

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
