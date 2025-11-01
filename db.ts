import { createRequire } from 'module';
import 'dotenv/config';
import type { User as TgUser } from 'grammy/types';
import type { Database as DatabaseType, Statement as StatementType } from 'better-sqlite3';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './db.sqlite3';

let db: DatabaseType | null = null;
let upsertUserStmt: StatementType | null = null;
let getUserIdStmt: StatementType | null = null;
let insertVideoStmt: StatementType | null = null;

try {
	db = new Database(DB_PATH);
	const database = db!; // Non-null assertion since we just assigned it

	database.pragma('journal_mode = WAL');
	database.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    full_name TEXT,
    phone TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
  );`);

	database.exec(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_ref TEXT, -- denormalized username or telegram id
    url TEXT NOT NULL,
    original_url TEXT,
    file_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );`);

	// Migration: add user_ref if missing
	try {
		const pragma = database.prepare('PRAGMA table_info(videos)').all() as { name: string }[];
		const hasUserRef = pragma.some((c) => c.name === 'user_ref');
		if (!hasUserRef) {
			database.exec('ALTER TABLE videos ADD COLUMN user_ref TEXT;');
		}
		const hasFileId = pragma.some((c) => c.name === 'file_id');
		if (!hasFileId) {
			database.exec('ALTER TABLE videos ADD COLUMN file_id TEXT;');
		}
	} catch (e) {
		console.warn('Could not ensure user_ref or file_id column:', e);
	}

	upsertUserStmt = database.prepare(`INSERT INTO users (telegram_id, username, full_name, phone, first_seen, last_seen)
  VALUES (@telegram_id, @username, @full_name, @phone, @now, @now)
  ON CONFLICT(telegram_id) DO UPDATE SET
    username=excluded.username,
    full_name=excluded.full_name,
    last_seen=excluded.last_seen`);

	getUserIdStmt = database.prepare('SELECT id FROM users WHERE telegram_id = ?');
	insertVideoStmt = database.prepare(
		`INSERT INTO videos (user_id, user_ref, url, original_url, file_id, created_at) VALUES (?, ?, ?, ?, ?, ?);`,
	);

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
	if (!db || !upsertUserStmt || !getUserIdStmt || !insertVideoStmt) {
		// Silently skip to keep bot functional
		return;
	}
	const now = new Date().toISOString();
	const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
	const userRef = user.username || String(user.id);
	upsertUserStmt.run({
		telegram_id: user.id,
		username: user.username || null,
		full_name: fullName || null,
		phone: null,
		now,
	});
	const row = getUserIdStmt.get(user.id) as { id: number } | undefined;
	if (!row) throw new Error('Failed to retrieve user id after upsert');
	insertVideoStmt.run(row.id, userRef, videoUrl, originalUrl || null, fileId || null, now);
}

export function saveOrUpdateUser(user: TgUser) {
	if (!db || !upsertUserStmt) return;
	const now = new Date().toISOString();
	const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
	upsertUserStmt.run({
		telegram_id: user.id,
		username: user.username || null,
		full_name: fullName || null,
		phone: null,
		now,
	});
}

export function stats() {
	if (!db) return { users: 0, videos: 0, disabled: true } as const;
	const users = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
	const videos = db.prepare('SELECT COUNT(*) as c FROM videos').get() as { c: number };
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

	const totalUsersResult = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
	const totalUsers = totalUsersResult.c;

	const totalVideosResult = db.prepare('SELECT COUNT(*) as c FROM videos').get() as { c: number };
	const totalVideos = totalVideosResult.c;

	const todayLoginsResult = db.prepare('SELECT COUNT(*) as c FROM users WHERE last_seen >= ?').get(todayStart) as {
		c: number;
	};
	const todayLogins = todayLoginsResult.c;

	const weeklyLoginsResult = db.prepare('SELECT COUNT(*) as c FROM users WHERE last_seen >= ?').get(weekAgoStart) as {
		c: number;
	};
	const weeklyLogins = weeklyLoginsResult.c;

	const dailyActiveResult = db
		.prepare('SELECT COUNT(DISTINCT user_id) as c FROM videos WHERE created_at >= ?')
		.get(todayStart) as { c: number };
	const dailyActiveUsers = dailyActiveResult.c;

	const weeklyActiveResult = db
		.prepare('SELECT COUNT(DISTINCT user_id) as c FROM videos WHERE created_at >= ?')
		.get(weekAgoStart) as { c: number };
	const weeklyActiveUsers = weeklyActiveResult.c;

	const topUsersResult = db
		.prepare(
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

export { db, DB_PATH };
