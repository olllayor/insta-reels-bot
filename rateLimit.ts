import { db } from './db.ts';

export type RateBucket = 'download' | 'inline' | 'photo' | 'video';

export interface RateLimitConfig {
	limit: number;
	windowMs: number;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	limit: number;
	retryAfterMs: number;
}

const BUCKET_LIMITS: Record<RateBucket, RateLimitConfig> = {
	download: {
		limit: Math.max(1, Number(process.env.RATE_LIMIT_DOWNLOAD_PER_MIN || 5)),
		windowMs: 60_000,
	},
	inline: {
		limit: Math.max(1, Number(process.env.RATE_LIMIT_INLINE_PER_MIN || 10)),
		windowMs: 60_000,
	},
	photo: {
		limit: Math.max(1, Number(process.env.RATE_LIMIT_PHOTO_PER_MIN || 3)),
		windowMs: 60_000,
	},
	video: {
		limit: Math.max(1, Number(process.env.RATE_LIMIT_VIDEO_PER_MIN || 3)),
		windowMs: 60_000,
	},
};

const CLEANUP_INTERVAL_MS = Math.max(5_000, Number(process.env.RATE_LIMIT_CLEANUP_INTERVAL_MS || 60_000));

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const ensureCleanup = () => {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(() => {
		if (!db) return;
		try {
			const cutoff = Date.now() - 5 * 60_000;
			db.run('DELETE FROM rate_events WHERE ts < ?', [cutoff]);
		} catch (e) {
			console.warn('[rateLimit] cleanup failed:', e);
		}
	}, CLEANUP_INTERVAL_MS);
	if (typeof cleanupTimer === 'object' && cleanupTimer && 'unref' in cleanupTimer) {
		(cleanupTimer as NodeJS.Timeout).unref?.();
	}
};

export const stopRateLimitCleanup = () => {
	if (cleanupTimer) {
		clearInterval(cleanupTimer);
		cleanupTimer = null;
	}
};

export const isRateLimitEnabled = (): boolean => process.env.RATE_LIMIT_DISABLED !== '1';

export const checkRateLimit = (userId: number, bucket: RateBucket): RateLimitResult => {
	if (!isRateLimitEnabled()) {
		const cfg = BUCKET_LIMITS[bucket];
		return { allowed: true, remaining: cfg.limit, limit: cfg.limit, retryAfterMs: 0 };
	}
	if (!db) {
		const cfg = BUCKET_LIMITS[bucket];
		return { allowed: true, remaining: cfg.limit, limit: cfg.limit, retryAfterMs: 0 };
	}

	ensureCleanup();

	const cfg = BUCKET_LIMITS[bucket];
	const now = Date.now();
	const windowStart = now - cfg.windowMs;

	let count = 0;
	let oldestInWindow = now;
	try {
		const row = db
			.query<{ c: number; oldest: number | null }, [number, string, number]>(
				'SELECT COUNT(*) as c, MIN(ts) as oldest FROM rate_events WHERE user_id = ? AND event_type = ? AND ts >= ?',
			)
			.get(userId, bucket, windowStart);
		count = row?.c ?? 0;
		oldestInWindow = row?.oldest ?? now;
	} catch (e) {
		console.warn('[rateLimit] count query failed:', e);
		return { allowed: true, remaining: cfg.limit, limit: cfg.limit, retryAfterMs: 0 };
	}

	if (count >= cfg.limit) {
		const retryAfterMs = Math.max(250, oldestInWindow + cfg.windowMs - now);
		return { allowed: false, remaining: 0, limit: cfg.limit, retryAfterMs };
	}

	try {
		db.run('INSERT INTO rate_events (user_id, event_type, ts) VALUES (?, ?, ?)', [userId, bucket, now]);
	} catch (e) {
		console.warn('[rateLimit] insert failed:', e);
	}

	return { allowed: true, remaining: Math.max(0, cfg.limit - count - 1), limit: cfg.limit, retryAfterMs: 0 };
};

export const getRateLimitStatus = (userId: number, bucket: RateBucket): { used: number; limit: number } => {
	if (!db) return { used: 0, limit: BUCKET_LIMITS[bucket].limit };
	const cfg = BUCKET_LIMITS[bucket];
	const windowStart = Date.now() - cfg.windowMs;
	try {
		const row = db
			.query<{ c: number }, [number, string, number]>(
				'SELECT COUNT(*) as c FROM rate_events WHERE user_id = ? AND event_type = ? AND ts >= ?',
			)
			.get(userId, bucket, windowStart);
		return { used: row?.c ?? 0, limit: cfg.limit };
	} catch {
		return { used: 0, limit: cfg.limit };
	}
};
