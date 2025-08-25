import { Bot, InputFile } from 'grammy';
import 'dotenv/config';
import { stat, writeFile, readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import AdmZip from 'adm-zip';
import './db.js'; // ensure DB initialized / file created

/**
 * Periodically sends the database file to the admin chat.
 * Env vars:
 *  BOT_TOKEN - Telegram bot token (required)
 *  ADMIN_CHAT_ID - Chat ID (number) to send file to (required)
 *  DB_PATH - Absolute or relative path to DB file (required)
 *  CRON_INTERVAL_HOURS - Optional override interval in hours (default 5)
 */

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? Number(process.env.ADMIN_CHAT_ID) : undefined;
const DB_PATH_ENV = process.env.DB_PATH || './db.sqlite3';
const INTERVAL_HOURS = process.env.CRON_INTERVAL_HOURS ? Number(process.env.CRON_INTERVAL_HOURS) : 5;

if (!BOT_TOKEN) {
	console.error('BOT_TOKEN missing');
	process.exit(1);
}
if (!ADMIN_CHAT_ID || Number.isNaN(ADMIN_CHAT_ID)) {
	console.error('ADMIN_CHAT_ID missing or invalid');
	process.exit(1);
}
if (Number.isNaN(INTERVAL_HOURS) || INTERVAL_HOURS <= 0) {
	console.error('CRON_INTERVAL_HOURS invalid (must be positive number)');
	process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

const DB_PATH = DB_PATH_ENV; // narrowed, guaranteed string

async function sendDbOnce() {
	try {
		// Ensure file exists (in case no activity yet created tables)
		try {
			await stat(DB_PATH);
		} catch {
			await writeFile(DB_PATH, ''); // touch file
		}
		const st = await stat(DB_PATH);
		const sizeKb = (st.size / 1024).toFixed(1);
		const iso = new Date().toISOString().replace(/[:]/g, '-');
		const baseName = DB_PATH.split('/').pop() || 'db.sqlite3';
		const zipName = `${baseName}.${iso}.zip`;
		let sent = false;
		try {
			const data = await readFile(DB_PATH);
			const zip = new AdmZip();
			zip.addFile(baseName, data);
			const zipBuffer = zip.toBuffer();
			const zipSizeKb = (zipBuffer.length / 1024).toFixed(1);
			const caption = `DB backup zipped (raw ${sizeKb} KB -> zip ${zipSizeKb} KB) @ ${new Date().toISOString()}`;
			await bot.api.sendDocument(ADMIN_CHAT_ID!, new InputFile(zipBuffer, zipName), { caption });
			console.log('DB zip sent successfully');
			sent = true;
		} catch (zipErr) {
			console.warn('Zipping failed, sending raw DB:', zipErr);
		}
		if (!sent) {
			const caption = `DB backup (raw ${sizeKb} KB) @ ${new Date().toISOString()}`;
			await bot.api.sendDocument(ADMIN_CHAT_ID!, new InputFile(createReadStream(DB_PATH), baseName), { caption });
			console.log('DB raw sent successfully');
		}
	} catch (err: any) {
		console.error('Failed to send DB:', err.message || err);
		try {
			await bot.api.sendMessage(ADMIN_CHAT_ID!, `Failed to send DB: ${err.message || err}`);
		} catch {
			/* ignore */
		}
	}
}

(async () => {
	console.log(`Cron worker started. Interval: ${INTERVAL_HOURS}h`);
	// Warm-up send immediately on start
	await sendDbOnce();
	const intervalMs = INTERVAL_HOURS * 60 * 60 * 1000;
	setInterval(sendDbOnce, intervalMs);
})();
