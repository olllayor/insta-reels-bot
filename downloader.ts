export const downloadInstagramContent = async (reelUrl: string) => {
	try {
		const result = await fetch(process.env.API_ENDPOINT!, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			// Server expects the field name to be `reelURL` (capital URL)
			body: JSON.stringify({ reelURL: reelUrl }),
		});
		if (!result.ok) {
			throw new Error(`HTTP error! status: ${result.status}`);
		}

		return await result.json();
	} catch (error) {
		console.error('Download failed:', error);
		throw error;
	}
};
