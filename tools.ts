export function isInstagramUrl(url: string): boolean {
	try {
		const urlObj = new URL(url);

		// Instagram domains (including mobile and short links)
		const validDomains = ['instagram.com', 'www.instagram.com', 'm.instagram.com', 'instagr.am', 'www.instagr.am'];

		if (!validDomains.includes(urlObj.hostname.toLowerCase())) {
			return false;
		}

		// Valid Instagram path patterns
		const validPaths = [
			/^\/$/, // Homepage
			/^\/[a-zA-Z0-9_.]{1,30}\/?$/, // User profile (Instagram username limits)
			/^\/p\/[a-zA-Z0-9_-]{11}\/?$/, // Post (specific length)
			/^\/reel\/[a-zA-Z0-9_-]{11}\/?$/, // Reel (specific length)
			/^\/reels\/[a-zA-Z0-9_-]{11}\/?$/, // Alternative reel path
			/^\/stories\/[a-zA-Z0-9_.]{1,30}\/[0-9]+\/?$/, // Story
			/^\/tv\/[a-zA-Z0-9_-]{11}\/?$/, // IGTV
			/^\/live\/[a-zA-Z0-9_.]{1,30}\/?$/, // Live
			/^\/explore\/?$/, // Explore
			/^\/explore\/tags\/[a-zA-Z0-9_.]+\/?$/, // Hashtag
			/^\/explore\/locations\/[0-9]+\/[^\/]+\/?$/, // Location
			/^\/accounts\/(login|emailsignup|password\/reset)\/?$/, // Auth pages
			/^\/direct\/(inbox|t\/[a-zA-Z0-9_-]+)\/?$/, // Direct messages
			/^\/s\/[a-zA-Z0-9_-]+\/?$/, // Short story links
		];

		// Check for query parameters that indicate Instagram URLs
		const hasInstagramParams = urlObj.searchParams.has('igshid') || urlObj.searchParams.has('utm_source');

		const pathValid = validPaths.some((pattern) => pattern.test(urlObj.pathname));

		// Accept if path matches OR if it has Instagram-specific params
		return pathValid || (hasInstagramParams && urlObj.pathname.length > 1);
	} catch {
		return false;
	}
}

export type Platform = 'instagram' | 'twitter' | 'youtube' | 'unknown';

export function detectPlatform(url: string): Platform {
	try {
		const u = new URL(url);
		const host = u.hostname.toLowerCase();
		if (host.includes('instagram.com') || host.includes('instagr.am')) return 'instagram';
		if (host === 'x.com' || host.endsWith('twitter.com') || host.includes('twimg.com')) return 'twitter';
		if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
		return 'unknown';
	} catch {
		return 'unknown';
	}
}
