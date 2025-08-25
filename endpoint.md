
// server.mjs
// Enhanced Instagram Reel Downloader with yt-dlp
// Features:
// - Better format selection: best[height<=1080] with fallback
// - Custom user-agent for mobile simulation and detection avoidance
// - JSON-structured cache with metadata (extraction time, duration, format)
// - Detailed logging for performance monitoring and debugging
// - Backward compatibility with legacy cache format

import express from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import Redis from 'ioredis';

const execFileAsync = promisify(execFile);
const app = express();

// Redis
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (err) => console.error('Redis error:', err));

// cookies path ensured
const COOKIES_PATH = process.env.COOKIES_PATH || './cookies/instagram.com_cookies.txt';
const cookiesDir = path.dirname(COOKIES_PATH);
if (!existsSync(cookiesDir)) mkdirSync(cookiesDir, { recursive: true });

// parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// simple request logger (helps debug 404 / wrong server)
app.use((req, res, next) => {
	console.log(new Date().toISOString(), req.method, req.url);
	// log body for POSTs so you can see what's coming in
	if (req.method === 'POST') console.log('body:', JSON.stringify(req.body));
	next();
});

// health endpoint so you can test server is your app
app.get('/', (req, res) => {
	res.json({ ok: true, service: 'yt-dlp-proxy' });
});

/**
 * Regex and helpers:
 * - Accept /p/, /reel/, /reels/, /stories/
 * - For /reel/ convert to /p/ for yt-dlp compatibility (optional)
 * - For /stories/ we extract username + story id and use that as cache key
 */
const instagramUrlRegex = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|stories)\/[^\/]+(?:\/[^\/?#]+)?/i;

function convertReelToPostUrl(url) {
	// If it's a reel, produce an equivalent /p/<id>/ URL for yt-dlp
	const match = url.match(/\/reels?\/([A-Za-z0-9_-]+)/i);
	if (match && match[1]) return `https://www.instagram.com/p/${match[1]}/`;
	return url;
}

function extractCacheKey(url) {
	// post/reel -> key is post id
	const postMatch = url.match(/\/p\/([^\/?#]+)/i) || url.match(/\/reels?\/([^\/?#]+)/i);
	if (postMatch && postMatch[1]) return `post_${postMatch[1]}`;

	// stories -> /stories/{username}/{storyId}
	const storyMatch = url.match(/\/stories\/([^\/?#\/]+)\/([^\/?#\/]+)/i);
	if (storyMatch && storyMatch[1] && storyMatch[2]) {
		const username = storyMatch[1];
		const storyId = storyMatch[2];
		return `story_${username}_${storyId}`;
	}

	// fallback to whole URL hashed-ish (simple): base64 of URL (short)
	return `url_${Buffer.from(url).toString('base64').slice(0, 32)}`;
}

app.post('/download', async (req, res) => {
	// Declare variables outside try so they are accessible in catch (for logging)
	let cacheKey = null;
	let reelURL = null;
	let postURL = null;
	try {
		reelURL = String(req.body?.reelURL || '').trim();
		if (!reelURL || !instagramUrlRegex.test(reelURL)) {
			return res
				.status(400)
				.json({ success: false, error: 'Invalid or missing Instagram URL. Supported: /p/, /reel(s)/, /stories/.' });
		}

		// convert reels to /p/ for yt-dlp if possible; leave stories untouched
		postURL = convertReelToPostUrl(reelURL);
		cacheKey = extractCacheKey(postURL);

		// check cache
		const cachedData = await redis.get(cacheKey);
		if (cachedData) {
			console.log(`Cache hit: ${cacheKey}`);

			try {
				// Try to parse as JSON (new format)
				const parsedData = JSON.parse(cachedData);
				console.log(`Cache metadata for ${cacheKey}:`, {
					extractedAt: parsedData.extractedAt,
					duration: parsedData.duration,
					format: parsedData.format,
				});
				return res.json({
					success: true,
					downloadUrl: parsedData.downloadUrl,
					cached: true,
					originalUrl: reelURL,
					metadata: {
						extractedAt: parsedData.extractedAt,
						duration: parsedData.duration,
						format: parsedData.format,
					},
				});
			} catch (e) {
				// Fallback for old cache format (plain URL string)
				console.log(`Cache hit (legacy format): ${cacheKey}`);
				return res.json({
					success: true,
					downloadUrl: cachedData,
					cached: true,
					originalUrl: reelURL,
					metadata: { format: 'legacy_cache' },
				});
			}
		}
		console.log(`Cache miss: ${cacheKey} -> fetching via yt-dlp`);

		// Enhanced yt-dlp args with better format selection and user-agent
		// Note: stories often require valid logged-in cookies
		const customUserAgent =
			'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

		const args = [
			'-g', // Get URL only
			'-f',
			'best[height<=1080]/best', // Best quality up to 1080p, fallback to best available
			'--user-agent',
			customUserAgent, // Custom user-agent to avoid detection
			'--cookies',
			COOKIES_PATH, // Use cookies file
			'--no-warnings', // Reduce noise in stderr
			postURL,
		];

		console.log(`yt-dlp attempt for ${cacheKey}:`, {
			url: postURL,
			userAgent: customUserAgent.substring(0, 50) + '...',
			format: 'best[height<=1080]/best',
		});

		const startTime = Date.now();
		const { stdout, stderr } = await execFileAsync('yt-dlp', args, {
			timeout: 60_000,
			maxBuffer: 10 * 1024 * 1024,
		});
		const duration = Date.now() - startTime;

		console.log(`yt-dlp execution completed in ${duration}ms`, {
			cacheKey,
			stdoutLength: stdout?.length || 0,
			stderrLength: stderr?.length || 0,
		});

		if (stderr) {
			console.log(`yt-dlp stderr for ${cacheKey}:`, stderr.trim());
		}

		if (!stdout || typeof stdout !== 'string') {
			console.error('yt-dlp no stdout', { cacheKey, stderr });
			throw new Error('yt-dlp returned no output');
		}

		const urls = stdout
			.trim()
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => /^https?:\/\//i.test(l));

		const downloadUrl = urls.length ? urls[urls.length - 1] : null;
		if (!downloadUrl) {
			console.error('No download url found', { cacheKey, stdout, stderr });
			throw new Error('No download URL found from yt-dlp');
		}

		console.log(`yt-dlp success for ${cacheKey}:`, {
			downloadUrl: downloadUrl.substring(0, 100) + '...',
			totalUrls: urls.length,
			duration: `${duration}ms`,
		});

		// Enhanced cache data with metadata
		const cacheData = {
			downloadUrl,
			originalUrl: reelURL,
			extractedAt: new Date().toISOString(),
			duration,
			format: 'best[height<=1080]/best',
			userAgent: customUserAgent.substring(0, 50) + '...',
		};

		// cache (20 days). NOTE: direct urls can expire sooner — see suggestions below.
		const ttlInSeconds = 20 * 24 * 60 * 60;
		await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', ttlInSeconds);

		return res.json({
			success: true,
			downloadUrl: cacheData.downloadUrl,
			originalUrl: reelURL,
			metadata: {
				extractedAt: cacheData.extractedAt,
				duration: cacheData.duration,
				format: cacheData.format,
				cached: false,
			},
		});
	} catch (err) {
		const errorDetails = {
			cacheKey: cacheKey || 'uninitialized',
			originalUrl: reelURL || req.body?.reelURL || 'unavailable',
			postURL: postURL || 'uninitialized',
			errorMessage: err?.message || String(err),
			errorStack: err?.stack || 'no stack trace',
			timestamp: new Date().toISOString(),
		};

		console.error('Download failed:', errorDetails);

		return res.status(500).json({
			error: 'Download failed',
			details: err?.message || String(err),
			timestamp: errorDetails.timestamp,
			cacheKey: errorDetails.cacheKey,
		});
	}
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));