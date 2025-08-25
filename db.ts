import Database from 'better-sqlite3';
import 'dotenv/config';
import type { User as TgUser } from 'grammy/types';

const DB_PATH = process.env.DB_PATH || './db.sqlite3';

let db: Database.Database | null = null;
let upsertUserStmt: Database.Statement | null = null;
let getUserIdStmt: Database.Statement | null = null;
let insertVideoStmt: Database.Statement | null = null;

try {
	db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    full_name TEXT,
    phone TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
  );`);

	db.exec(`CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_ref TEXT, -- denormalized username or telegram id
    url TEXT NOT NULL,
    original_url TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );`);

	// Migration: add user_ref if missing
	try {
		const pragma = db.prepare('PRAGMA table_info(videos)').all() as { name: string }[];
		const hasUserRef = pragma.some((c) => c.name === 'user_ref');
		if (!hasUserRef) {
			db.exec('ALTER TABLE videos ADD COLUMN user_ref TEXT;');
		}
	} catch (e) {
		console.warn('Could not ensure user_ref column:', e);
	}

	upsertUserStmt = db.prepare(`INSERT INTO users (telegram_id, username, full_name, phone, first_seen, last_seen)
  VALUES (@telegram_id, @username, @full_name, @phone, @now, @now)
  ON CONFLICT(telegram_id) DO UPDATE SET
    username=excluded.username,
    full_name=excluded.full_name,
    last_seen=excluded.last_seen`);

	getUserIdStmt = db.prepare('SELECT id FROM users WHERE telegram_id = ?');
	insertVideoStmt = db.prepare(
		`INSERT INTO videos (user_id, user_ref, url, original_url, created_at) VALUES (?, ?, ?, ?, ?);`,
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
	created_at: string;
}

export function saveUserAndVideo(user: TgUser, videoUrl: string, originalUrl?: string) {
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
	insertVideoStmt.run(row.id, userRef, videoUrl, originalUrl || null, now);
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

export { db, DB_PATH };
