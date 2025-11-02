/**
 * Check if URL is valid for any supported platform
 * Supports: instagram, tiktok, twitter, youtube, facebook, reddit, vimeo, twitch,
 * snapchat, soundcloud, pinterest, streamable, dailymotion, bilibili, bluesky,
 * loom, ok, newgrounds, rutube, tumblr, vk, xiaohongshu
 */
export function isValidMediaUrl(url: string): boolean {
	try {
		const urlObj = new URL(url);
		const host = urlObj.hostname.toLowerCase();

		// List of supported platforms by domain patterns
		const supportedDomains = [
			// Instagram
			'instagram.com',
			'www.instagram.com',
			'm.instagram.com',
			'instagr.am',
			'www.instagr.am',
			// TikTok
			'tiktok.com',
			'www.tiktok.com',
			'm.tiktok.com',
			'vt.tiktok.com',
			'vm.tiktok.com',
			// Twitter/X
			'twitter.com',
			'www.twitter.com',
			't.co',
			'x.com',
			'www.x.com',
			// YouTube
			'youtube.com',
			'www.youtube.com',
			'youtu.be',
			'm.youtube.com',
			'youtube-nocookie.com',
			// Facebook
			'facebook.com',
			'www.facebook.com',
			'fb.com',
			'fb.watch',
			'm.facebook.com',
			// Reddit
			'reddit.com',
			'www.reddit.com',
			'm.reddit.com',
			// Vimeo
			'vimeo.com',
			'www.vimeo.com',
			// Twitch
			'twitch.tv',
			'www.twitch.tv',
			'clips.twitch.tv',
			// Snapchat
			'snapchat.com',
			'www.snapchat.com',
			'snap.com',
			'www.snap.com',
			// Soundcloud
			'soundcloud.com',
			'www.soundcloud.com',
			'on.soundcloud.com',
			// Pinterest
			'pinterest.com',
			'www.pinterest.com',
			'pin.it',
			// Streamable
			'streamable.com',
			'www.streamable.com',
			// Dailymotion
			'dailymotion.com',
			'www.dailymotion.com',
			'dai.ly',
			// Bilibili
			'bilibili.com',
			'www.bilibili.com',
			'b23.tv',
			// Bluesky
			'bsky.app',
			'bluesky.app',
			// Loom
			'loom.com',
			'www.loom.com',
			// OK (Одноклассники)
			'ok.ru',
			'www.ok.ru',
			'odnoklassniki.ru',
			'www.odnoklassniki.ru',
			// Newgrounds
			'newgrounds.com',
			'www.newgrounds.com',
			// Rutube
			'rutube.ru',
			'www.rutube.ru',
			// Tumblr
			'tumblr.com',
			'www.tumblr.com',
			// VK (ВКонтакте)
			'vk.com',
			'www.vk.com',
			'vkontakte.ru',
			'www.vkontakte.ru',
			// Xiaohongshu (小红书)
			'xiaohongshu.com',
			'www.xiaohongshu.com',
			'xhslink.com',
		];

		// Check if host matches any supported domain
		return supportedDomains.some((domain) => host === domain || host.endsWith('.' + domain));
	} catch {
		return false;
	}
}

/**
 * Detect platform from URL
 */
export type Platform =
	| 'instagram'
	| 'tiktok'
	| 'twitter'
	| 'youtube'
	| 'facebook'
	| 'reddit'
	| 'vimeo'
	| 'twitch'
	| 'snapchat'
	| 'soundcloud'
	| 'pinterest'
	| 'streamable'
	| 'dailymotion'
	| 'bilibili'
	| 'bluesky'
	| 'loom'
	| 'ok'
	| 'newgrounds'
	| 'rutube'
	| 'tumblr'
	| 'vk'
	| 'xiaohongshu'
	| 'unknown';

export function detectPlatform(url: string): Platform {
	try {
		const u = new URL(url);
		const host = u.hostname.toLowerCase();

		// Instagram
		if (host.includes('instagram.com') || host.includes('instagr.am')) return 'instagram';
		// TikTok
		if (host.includes('tiktok.com') || host.includes('vm.tiktok') || host.includes('vt.tiktok')) return 'tiktok';
		// Twitter/X
		if (host === 'x.com' || host.endsWith('twitter.com') || host === 't.co') return 'twitter';
		// YouTube
		if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
		// Facebook
		if (host.includes('facebook.com') || host === 'fb.watch' || host.includes('fb.')) return 'facebook';
		// Reddit
		if (host.includes('reddit.com')) return 'reddit';
		// Vimeo
		if (host.includes('vimeo.com')) return 'vimeo';
		// Twitch
		if (host.includes('twitch.tv')) return 'twitch';
		// Snapchat
		if (host.includes('snapchat.com') || host.includes('snap.com')) return 'snapchat';
		// Soundcloud
		if (host.includes('soundcloud.com')) return 'soundcloud';
		// Pinterest
		if (host.includes('pinterest.com') || host === 'pin.it') return 'pinterest';
		// Streamable
		if (host.includes('streamable.com')) return 'streamable';
		// Dailymotion
		if (host.includes('dailymotion.com') || host === 'dai.ly') return 'dailymotion';
		// Bilibili
		if (host.includes('bilibili.com') || host === 'b23.tv') return 'bilibili';
		// Bluesky
		if (host.includes('bsky.app') || host.includes('bluesky.app')) return 'bluesky';
		// Loom
		if (host.includes('loom.com')) return 'loom';
		// OK
		if (host.includes('ok.ru') || host.includes('odnoklassniki.ru')) return 'ok';
		// Newgrounds
		if (host.includes('newgrounds.com')) return 'newgrounds';
		// Rutube
		if (host.includes('rutube.ru')) return 'rutube';
		// Tumblr
		if (host.includes('tumblr.com')) return 'tumblr';
		// VK
		if (host.includes('vk.com') || host.includes('vkontakte.ru')) return 'vk';
		// Xiaohongshu
		if (host.includes('xiaohongshu.com') || host === 'xhslink.com') return 'xiaohongshu';

		return 'unknown';
	} catch {
		return 'unknown';
	}
}

// Keep backward compatibility for Instagram-specific checks
export function isInstagramUrl(url: string): boolean {
	return detectPlatform(url) === 'instagram';
}
