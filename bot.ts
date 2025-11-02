import { Bot } from 'grammy';
import 'dotenv/config';
import { isInstagramUrl } from './tools.js';
import { downloadInstagramContent } from './downloader.js';
import { saveUserAndVideo, saveOrUpdateUser, getAdminStats } from './db.js';

// Simple logger with timestamp
const log = (level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) => {
	const timestamp = new Date().toISOString();
	const prefix = `[${timestamp}] [${level}]`;
	if (data) {
		console.log(`${prefix} ${message}`, data);
	} else {
		console.log(`${prefix} ${message}`);
	}
};

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
	console.error('BOT_TOKEN is missing in environment. Exiting to avoid restart loop.');
	process.exit(1);
}

log('INFO', 'Bot initialized.');
const bot = new Bot(BOT_TOKEN);
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

bot.command('start', async (ctx) => {
	try {
		if (ctx.from) {
			saveOrUpdateUser(ctx.from);
			log('INFO', `User saved or updated`, {
				userId: ctx.from.id,
				username: ctx.from.username || 'N/A',
				firstName: ctx.from.first_name,
				isFirstTime: !ctx.from.is_bot,
			});
		}
	} catch (err) {
		log('WARN', `Failed to save user ${ctx.from?.id}`, err);
	}
	await ctx.reply('Send me an Instagram Reel link (post/reel) and I will fetch the video for you.');
});

bot.command('admin', async (ctx) => {
	if (!ADMIN_ID || ctx.from?.id !== ADMIN_ID) {
		await ctx.reply('❌ You do not have permission to use this command.');
		return;
	}

	const stats = getAdminStats();
	const message = `
📊 <b>BOT ANALYTICS</b>

👥 <b>User Statistics</b>
• Total Users: ${stats.totalUsers}
• Today Logins: ${stats.todayLogins}
• Weekly Logins: ${stats.weeklyLogins}

🎬 <b>Video Statistics</b>
• Total Videos: ${stats.totalVideos}
• Daily Active Users: ${stats.dailyActiveUsers}
• Weekly Active Users: ${stats.weeklyActiveUsers}
• Avg Videos/User: ${stats.avgVideosPerUser}

🏆 <b>Top Users</b>
${stats.topUsers.map((u, i) => `${i + 1}. @${u.username}: ${u.videoCount} videos`).join('\n') || 'No data'}
`;
	await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('stats', async (ctx) => {
	if (!ADMIN_ID || ctx.from?.id !== ADMIN_ID) {
		await ctx.reply('❌ You do not have permission to use this command.');
		return;
	}

	const adminStats = getAdminStats();
	const message = `
📊 <b>DETAILED STATISTICS</b>

🔹 <b>Engagement Metrics</b>
  Today Login Rate: ${
		adminStats.totalUsers > 0 ? ((adminStats.todayLogins / adminStats.totalUsers) * 100).toFixed(1) : 0
	}%
  Weekly Login Rate: ${
		adminStats.totalUsers > 0 ? ((adminStats.weeklyLogins / adminStats.totalUsers) * 100).toFixed(1) : 0
	}%
  Daily Activity: ${adminStats.dailyActiveUsers} users (${
		adminStats.totalUsers > 0 ? ((adminStats.dailyActiveUsers / adminStats.totalUsers) * 100).toFixed(1) : 0
	}%)
  Weekly Activity: ${adminStats.weeklyActiveUsers} users (${
		adminStats.totalUsers > 0 ? ((adminStats.weeklyActiveUsers / adminStats.totalUsers) * 100).toFixed(1) : 0
	}%)

🔹 <b>Content</b>
  Total Videos Processed: ${adminStats.totalVideos}
  Avg Videos per User: ${adminStats.avgVideosPerUser}
`;
	await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.command('help', async (ctx) => {
	const isAdmin = ADMIN_ID && ctx.from?.id === ADMIN_ID;
	const message = `
📖 <b>BOT COMMANDS</b>

/start - Get started
/help - Show this message
${isAdmin ? '/admin - View bot analytics\n/stats - View detailed statistics' : ''}

Just send me an Instagram Reel link and I'll download it for you!
`;
	await ctx.reply(message, { parse_mode: 'HTML' });
});

bot.on('message:text', async (ctx) => {
	const text = ctx.message.text;
	if (isInstagramUrl(text)) {
		log('INFO', `Instagram URL received from user`, {
			userId: ctx.from?.id,
			username: ctx.from?.username || 'N/A',
			url: text,
		});

		try {
			await ctx.reply('🔄 Fetching reel...');
			const response = await downloadInstagramContent(text);
			if (!response.success) {
				// Type narrowing: response is now DownloaderErrorResponseMinimal
				const errorMsg: string = (response as any).error;
				let userMessage = `❌ Download failed: ${errorMsg}`;
				if (errorMsg.includes('rate-limit') || errorMsg.includes('login required')) {
					userMessage = '❌ Instagram is currently blocking requests. Please try again later or with a different reel.';
				} else if (errorMsg.includes('not available')) {
					userMessage = '❌ This content is not available (private account or deleted post).';
				} else if (errorMsg.includes('timeout')) {
					userMessage = '❌ Request timed out. Please try again.';
				}
				log('WARN', `Download failed for user`, {
					userId: ctx.from?.id,
					username: ctx.from?.username,
					error: errorMsg,
				});
				return await ctx.reply(userMessage);
			}
			await ctx.api.sendChatAction(ctx.chat.id, 'upload_video');
			const caption = `⏱ ${response.elapsedMs} ms | @SaveReelsNowBot`;
			await ctx.api.sendVideo(ctx.chat.id, response.url, { supports_streaming: true, caption });

			// Send to channel for persistence and get file_id
			let fileId: string | undefined;
			try {
				const channelMsg = await ctx.api.sendVideo('@reels_db', response.url, { supports_streaming: true, caption });
				fileId = channelMsg.video?.file_id;
			} catch (channelErr) {
				log('WARN', `Failed to send to channel`, { error: channelErr });
			}

			// Persist user and video
			try {
				saveUserAndVideo(ctx.from!, response.url, text, fileId);
				log('INFO', `Video successfully saved for user`, {
					userId: ctx.from?.id,
					username: ctx.from?.username || 'N/A',
					responseTime: `${response.elapsedMs}ms`,
					hasFileId: !!fileId,
				});
			} catch (persistErr) {
				log('WARN', `Failed to persist video record`, { userId: ctx.from?.id, error: persistErr });
			}
		} catch (error) {
			log('ERROR', `Download error for user`, {
				userId: ctx.from?.id,
				username: ctx.from?.username || 'N/A',
				error: error,
			});
			await ctx.reply('❌ Failed to process the URL. Please try again.');
		}
	}
});

bot.start();
