import { Database } from 'bun:sqlite';
import 'dotenv/config';
import type { User as TgUser } from 'grammy/types';

const DB_PATH = process.env.DB_PATH || './db.sqlite3';
const DB_INIT_RETRIES = Math.max(1, Number(process.env.DB_INIT_RETRIES || 8));
const DB_INIT_RETRY_DELAY_MS = Math.max(50, Number(process.env.DB_INIT_RETRY_DELAY_MS || 250));

let db: Database | null = null;

const isBusyDatabaseError = (err: unknown) => {
	const maybeErr = err as { code?: string; message?: string } | undefined;
	const code = maybeErr?.code || '';
	const message = String(maybeErr?.message || '').toLowerCase();
	return code.startsWith('SQLITE_BUSY') || message.includes('database is locked') || message.includes('sqlite_busy');
};

const sleepSync = (ms: number) => {
	const lock = new Int32Array(new SharedArrayBuffer(4));
	Atomics.wait(lock, 0, 0, ms);
};

try {
	let initAttempt = 0;
	let initialized = false;
	let lastError: unknown;

	while (!initialized && initAttempt < DB_INIT_RETRIES) {
		initAttempt++;
		try {
			db = new Database(DB_PATH, { timeout: 5000 });
			initialized = true;
		} catch (openErr) {
			lastError = openErr;
			if (!isBusyDatabaseError(openErr) || initAttempt >= DB_INIT_RETRIES) {
				throw openErr;
			}
			console.warn(
				`[DB] Open attempt ${initAttempt}/${DB_INIT_RETRIES} failed due to lock, retrying in ${DB_INIT_RETRY_DELAY_MS}ms...`,
			);
			sleepSync(DB_INIT_RETRY_DELAY_MS);
		}
	}

	if (!db) {
		throw lastError || new Error('Database initialization failed with unknown error');
	}

	const database = db!; // Non-null assertion since we just assigned it

	database.pragma('busy_timeout = 5000');
	database.pragma('journal_mode = WAL');
	database.pragma('synchronous = NORMAL');
	database.pragma('cache_size = -64000'); // ~64MB cache
	database.exec(`CREATE TABLE IF NOT EXISTS users (    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    full_name TEXT,
    phone TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
  )`);

	db.exec(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_ref TEXT, -- denormalized username or telegram id
    url TEXT NOT NULL,
    original_url TEXT,
    file_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

	db.exec(`CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    total_users INTEGER NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`);

	try {
		const pragma = db.query('PRAGMA table_info(videos)').all() as { name: string }[];
		const hasUserRef = pragma.some((c) => c.name === 'user_ref');
		if (!hasUserRef) {
			db.exec('ALTER TABLE videos ADD COLUMN user_ref TEXT');
		}
		const hasFileId = pragma.some((c) => c.name === 'file_id');
		if (!hasFileId) {
			db.exec('ALTER TABLE videos ADD COLUMN file_id TEXT');
		}
	} catch (e) {
		console.warn('Could not ensure user_ref or file_id column:', e);
	}

	console.log(`[DB] Initialized at ${DB_PATH}`);
} catch (e) {
	console.error('[DB] Initialization failed; database features disabled. Cause:', e);
}

export interface SavedVideoRecord {
	id: number;
	user_id: number;
	url: string;
	original_url?: string | null;
	file_id?: string | null;
	created_at: string;
}

export function saveUserAndVideo(user: TgUser, videoUrl: string, originalUrl?: string, fileId?: string) {
	if (!db) {
		return;
	}
	const now = new Date().toISOString();
	const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
	const userRef = user.username || String(user.id);
	
	const upsertUserStmt = db.query(`INSERT INTO users (telegram_id, username, full_name, phone, first_seen, last_seen)
  VALUES ($telegram_id, $username, $full_name, $phone, $now, $now)
  ON CONFLICT(telegram_id) DO UPDATE SET
    username=excluded.username,
    full_name=excluded.full_name,
    last_seen=excluded.last_seen`);
	
	upsertUserStmt.run({
		$telegram_id: user.id,
		$username: user.username || null,
		$full_name: fullName || null,
		$phone: null,
		$now: now,
	});
	
	const getUserIdStmt = db.query('SELECT id FROM users WHERE telegram_id = $telegram_id');
	const row = getUserIdStmt.get({ $telegram_id: user.id }) as { id: number } | undefined;
	if (!row) throw new Error('Failed to retrieve user id after upsert');
	
	const insertVideoStmt = db.query(
		`INSERT INTO videos (user_id, user_ref, url, original_url, file_id, created_at) VALUES ($user_id, $user_ref, $url, $original_url, $file_id, $created_at)`
	);
	insertVideoStmt.run({
		$user_id: row.id,
		$user_ref: userRef,
		$url: videoUrl,
		$original_url: originalUrl || null,
		$file_id: fileId || null,
		$created_at: now,
	});
}

export function saveOrUpdateUser(user: TgUser) {
	if (!db) return;
	const now = new Date().toISOString();
	const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
	
	const upsertUserStmt = db.query(`INSERT INTO users (telegram_id, username, full_name, phone, first_seen, last_seen)
  VALUES ($telegram_id, $username, $full_name, $phone, $now, $now)
  ON CONFLICT(telegram_id) DO UPDATE SET
    username=excluded.username,
    full_name=excluded.full_name,
    last_seen=excluded.last_seen`);
	
	upsertUserStmt.run({
		$telegram_id: user.id,
		$username: user.username || null,
		$full_name: fullName || null,
		$phone: null,
		$now: now,
	});
}

export function stats() {
	if (!db) return { users: 0, videos: 0, disabled: true } as const;
	const users = db.query('SELECT COUNT(*) as c FROM users').get() as { c: number };
	const videos = db.query('SELECT COUNT(*) as c FROM videos').get() as { c: number };
	return { users: users.c, videos: videos.c, disabled: false };
}

export interface AdminStats {
	totalUsers: number;
	totalVideos: number;
	todayLogins: number;
	weeklyLogins: number;
	dailyActiveUsers: number;
	weeklyActiveUsers: number;
	topUsers: Array<{ username: string; videoCount: number }>;
	avgVideosPerUser: number;
}

export function getAdminStats(): AdminStats {
	if (!db) {
		return {
			totalUsers: 0,
			totalVideos: 0,
			todayLogins: 0,
			weeklyLogins: 0,
			dailyActiveUsers: 0,
			weeklyActiveUsers: 0,
			topUsers: [],
			avgVideosPerUser: 0,
		};
	}

	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
	const weekAgoStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

	const totalUsersResult = db.query('SELECT COUNT(*) as c FROM users').get() as { c: number };
	const totalUsers = totalUsersResult.c;

	const totalVideosResult = db.query('SELECT COUNT(*) as c FROM videos').get() as { c: number };
	const totalVideos = totalVideosResult.c;

	const todayLoginsResult = db.query('SELECT COUNT(*) as c FROM users WHERE last_seen >= $todayStart').get({ $todayStart: todayStart }) as {
		c: number;
	};
	const todayLogins = todayLoginsResult.c;

	const weeklyLoginsResult = db.query('SELECT COUNT(*) as c FROM users WHERE last_seen >= $weekAgoStart').get({ $weekAgoStart: weekAgoStart }) as {
		c: number;
	};
	const weeklyLogins = weeklyLoginsResult.c;

	const dailyActiveResult = db
		.query('SELECT COUNT(DISTINCT user_id) as c FROM videos WHERE created_at >= $todayStart')
		.get({ $todayStart: todayStart }) as { c: number };
	const dailyActiveUsers = dailyActiveResult.c;

	const weeklyActiveResult = db
		.query('SELECT COUNT(DISTINCT user_id) as c FROM videos WHERE created_at >= $weekAgoStart')
		.get({ $weekAgoStart: weekAgoStart }) as { c: number };
	const weeklyActiveUsers = weeklyActiveResult.c;

	const topUsersResult = db
		.query(
			`SELECT user_ref, COUNT(*) as videoCount FROM videos
       GROUP BY user_id
       ORDER BY videoCount DESC
       LIMIT 10`,
		)
		.all() as Array<{ user_ref: string; videoCount: number }>;
	const topUsers = topUsersResult.map((u) => ({ username: u.user_ref, videoCount: u.videoCount }));

	const avgResult = totalUsers > 0 ? totalVideos / totalUsers : 0;

	return {
		totalUsers,
		totalVideos,
		todayLogins,
		weeklyLogins,
		dailyActiveUsers,
		weeklyActiveUsers,
		topUsers,
		avgVideosPerUser: Math.round(avgResult * 100) / 100,
	};
}

export function getAllUserIds(): number[] {
	if (!db) return [];
	const result = db.query('SELECT telegram_id FROM users ORDER BY telegram_id ASC').all() as Array<{
		telegram_id: number;
	}>;
	return result.map((r) => r.telegram_id);
}

export interface BroadcastRecord {
	id: number;
	admin_id: number;
	message: string;
	total_users: number;
	success_count: number;
	failure_count: number;
	created_at: string;
}

export function saveBroadcast(
	adminId: number,
	message: string,
	totalUsers: number,
	successCount: number,
	failureCount: number,
) {
	if (!db) return;
	try {
		const now = new Date().toISOString();
		db.query(
			`INSERT INTO broadcasts (admin_id, message, total_users, success_count, failure_count, created_at)
       VALUES ($adminId, $message, $totalUsers, $successCount, $failureCount, $now)`,
		).run({
			$adminId: adminId,
			$message: message,
			$totalUsers: totalUsers,
			$successCount: successCount,
			$failureCount: failureCount,
			$now: now,
		});
	} catch (e) {
		console.warn('Failed to save broadcast record:', e);
	}
}

export interface BroadcastStats {
	totalBroadcasts: number;
	lastBroadcast: BroadcastRecord | null;
	totalMessagesSent: number;
	broadcasts: BroadcastRecord[];
}

export function getBroadcastStats(): BroadcastStats {
	if (!db) {
		return {
			totalBroadcasts: 0,
			lastBroadcast: null,
			totalMessagesSent: 0,
			broadcasts: [],
		};
	}

	try {
		const totalResult = db.query('SELECT COUNT(*) as c FROM broadcasts').get() as { c: number };
		const totalBroadcasts = totalResult.c;

		const lastResult = db.query('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 1').get() as
			| BroadcastRecord
			| undefined;

		const sentResult = db.query('SELECT SUM(success_count) as total FROM broadcasts').get() as {
			total: number | null;
		};
		const totalMessagesSent = sentResult.total || 0;

		const broadcastsResult = db
			.query('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT 10')
			.all() as BroadcastRecord[];

		return {
			totalBroadcasts,
			lastBroadcast: lastResult || null,
			totalMessagesSent,
			broadcasts: broadcastsResult,
		};
	} catch (e) {
		console.warn('Failed to get broadcast stats:', e);
		return {
			totalBroadcasts: 0,
			lastBroadcast: null,
			totalMessagesSent: 0,
			broadcasts: [],
		};
	}
}

export { db, DB_PATH };
