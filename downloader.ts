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

// Performs the POST call and returns a typed / validated response
export const downloadInstagramContent = async (reelUrl: string): Promise<DownloaderResponse> => {
	const endpoint = process.env.API_ENDPOINT;
	if (!endpoint) {
		return { success: false, error: 'Server misconfiguration: API_ENDPOINT missing', elapsedMs: 0 };
	}

	try {
		const started = performance.now();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 25_000); // 25s timeout

		const result = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ reelURL: reelUrl }), // backend expects `reelURL`
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
				errorDetail = parsed.details || parsed.error || errorDetail;
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

		// Accept either new minimal server contract or legacy structure.
		if (json?.downloadUrl) {
			return { success: true, url: json.downloadUrl, elapsedMs };
		}
		if (json?.url) {
			return { success: true, url: json.url, elapsedMs };
		}
		const errorMessage = json?.error || json?.message || 'Unknown API error';
		return { success: false, error: errorMessage, elapsedMs };
	} catch (err: any) {
		const elapsedMs = 0; // unknown (failed early)
		if (err?.name === 'AbortError') {
			return { success: false, error: 'Request timed out', elapsedMs };
		}
		console.error('Download failed:', err);
		return { success: false, error: 'Internal fetch error', elapsedMs };
	}
};
