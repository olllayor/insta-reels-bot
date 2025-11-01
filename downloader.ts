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

// Performs the POST call to cobalt endpoint and returns a typed / validated response
export const downloadInstagramContent = async (mediaUrl: string): Promise<DownloaderResponse> => {
	// Prefer env but default to cobalt for convenience
	const endpoint = process.env.API_ENDPOINT || 'https://cobalt.ollayor.uz/';
	const timeoutMs = Number(process.env.DOWNLOADER_TIMEOUT_MS || 20000);

	try {
		const started = performance.now();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		const result = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			// cobalt expects { url, videoQuality? } where videoQuality only accepts "max" currently
			body: JSON.stringify({ url: mediaUrl, videoQuality: 'max' }),
			signal: controller.signal,
		});
		clearTimeout(timeout);

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
		const elapsedMs = 0; // unknown (failed early)
		if (err?.name === 'AbortError') {
			return { success: false, error: 'Request timed out', elapsedMs };
		}
		console.error('Download failed:', err);
		return { success: false, error: 'Internal fetch error', elapsedMs };
	}
};
