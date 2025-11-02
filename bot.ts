import { Bot } from 'grammy';
import 'dotenv/config';
import { isValidMediaUrl } from './tools.js';
import { downloadInstagramContent } from './downloader.js';
import {
	saveUserAndVideo,
	saveOrUpdateUser,
	getAdminStats,
	getAllUserIds,
	saveBroadcast,
	getBroadcastStats,
} from './db.js';

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

// Simple metrics tracker for API response times
interface Metrics {
	totalRequests: number;
	totalTime: number;
	minTime: number;
	maxTime: number;
	avgTime: () => number;
}
const metrics: Metrics = {
	totalRequests: 0,
	totalTime: 0,
	minTime: Infinity,
	maxTime: 0,
	avgTime: function () {
		return this.totalRequests === 0 ? 0 : Math.round(this.totalTime / this.totalRequests);
	},
};

const trackMetric = (elapsedMs: number) => {
	metrics.totalRequests++;
	metrics.totalTime += elapsedMs;
	metrics.minTime = Math.min(metrics.minTime, elapsedMs);
	metrics.maxTime = Math.max(metrics.maxTime, elapsedMs);
};

// Log metrics every 10 downloads
const logMetricsIfNeeded = () => {
	if (metrics.totalRequests > 0 && metrics.totalRequests % 10 === 0) {
		log('INFO', `Metrics (${metrics.totalRequests} downloads)`, {
			avgMs: metrics.avgTime(),
			minMs: metrics.minTime,
			maxMs: metrics.maxTime,
		});
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
	await ctx.reply(
		'Send me a media link from any supported platform and I will fetch the video for you.\n\nSupported: Instagram, TikTok, Twitter/X, YouTube, Facebook, Reddit, Vimeo, Twitch, Snapchat, SoundCloud, Pinterest, Streamable, Dailymotion, Bilibili, Bluesky, Loom, OK, Newgrounds, Rutube, Tumblr, VK, Xiaohongshu',
	);
});

bot.command('admin', async (ctx) => {
	if (!ADMIN_ID || ctx.from?.id !== ADMIN_ID) {
		await ctx.reply('❌ You do not have permission to use this command.');
		return;
	}

	const message = `
📋 <b>ADMIN PANEL</b>

Choose an action:
`;
	await ctx.reply(message, {
		parse_mode: 'HTML',
		reply_markup: {
			inline_keyboard: [
				[
					{ text: '📊 Analytics', callback_data: 'admin_analytics' },
					{ text: '📈 Stats', callback_data: 'admin_stats' },
				],
				[
					{ text: '📢 Broadcast', callback_data: 'admin_broadcast' },
					{ text: '📡 Broadcast Stats', callback_data: 'admin_broadcast_stats' },
				],
			],
		},
	});
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

bot.command('broadcast', async (ctx) => {
	if (!ADMIN_ID || ctx.from?.id !== ADMIN_ID) {
		await ctx.reply('❌ You do not have permission to use this command.');
		return;
	}

	const text = ctx.message?.text || '';
	const args = text.split(' ').slice(1).join(' ') || '';
	if (!args) {
		await ctx.reply('❌ Please provide a message to broadcast.\n\nUsage: /broadcast <message>');
		return;
	}

	const userIds = getAllUserIds();
	if (userIds.length === 0) {
		await ctx.reply('❌ No users to broadcast to.');
		return;
	}

	await ctx.reply(`📢 Broadcasting message to ${userIds.length} users...\nThis may take a moment.`);

	let successCount = 0;
	let failureCount = 0;

	for (const userId of userIds) {
		try {
			await ctx.api.sendMessage(userId, args, { parse_mode: 'HTML' });
			successCount++;
		} catch (error) {
			log('WARN', `Failed to send broadcast to user ${userId}`, error);
			failureCount++;
		}
	}

	log('INFO', `Broadcast completed`, {
		totalUsers: userIds.length,
		successCount,
		failureCount,
		message: args,
	});

	await ctx.reply(
		`✅ Broadcast completed!\n\n📊 Results:\n• Sent: ${successCount}/${userIds.length}\n• Failed: ${failureCount}/${userIds.length}`,
	);
});

bot.command('help', async (ctx) => {
	const isAdmin = ADMIN_ID && ctx.from?.id === ADMIN_ID;
	const message = `
📖 <b>BOT COMMANDS</b>

/start - Get started
/help - Show this message
${
	isAdmin
		? '/admin - View bot analytics\n/stats - View detailed statistics\n/broadcast - Send message to all users'
		: ''
}

Send me a media link from any supported platform and I'll download the video for you!

<b>Supported Platforms:</b> Instagram, TikTok, Twitter/X, YouTube, Facebook, Reddit, Vimeo, Twitch, Snapchat, SoundCloud, Pinterest, Streamable, Dailymotion, Bilibili, Bluesky, Loom, OK, Newgrounds, Rutube, Tumblr, VK, Xiaohongshu
`;
	await ctx.reply(message, { parse_mode: 'HTML' });
});

// Admin callback handlers
bot.on('callback_query:data', async (ctx) => {
	if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) {
		await ctx.answerCallbackQuery({ text: '❌ Unauthorized', show_alert: true });
		return;
	}

	const data = ctx.callbackQuery.data;

	if (data === 'admin_analytics') {
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
		await ctx.editMessageText(message, {
			parse_mode: 'HTML',
			reply_markup: {
				inline_keyboard: [
					[
						{ text: '📈 Stats', callback_data: 'admin_stats' },
						{ text: '📢 Broadcast', callback_data: 'admin_broadcast' },
					],
					[{ text: '« Back', callback_data: 'admin_back' }],
				],
			},
		});
	} else if (data === 'admin_stats') {
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
		await ctx.editMessageText(message, {
			parse_mode: 'HTML',
			reply_markup: {
				inline_keyboard: [
					[
						{ text: '📊 Analytics', callback_data: 'admin_analytics' },
						{ text: '📢 Broadcast', callback_data: 'admin_broadcast' },
					],
					[{ text: '« Back', callback_data: 'admin_back' }],
				],
			},
		});
	} else if (data === 'admin_broadcast') {
		await ctx.editMessageText(
			'📢 <b>BROADCAST MESSAGE</b>\n\nPlease reply with the message you want to broadcast to all users.\n\n(You can use HTML formatting)',
			{
				parse_mode: 'HTML',
				reply_markup: {
					inline_keyboard: [
						[
							{ text: '📊 Analytics', callback_data: 'admin_analytics' },
							{ text: '📈 Stats', callback_data: 'admin_stats' },
						],
						[{ text: '« Back', callback_data: 'admin_back' }],
					],
				},
			},
		);
	} else if (data === 'admin_broadcast_stats') {
		const bStats = getBroadcastStats();
		const lastBroadcastStr = bStats.lastBroadcast
			? `<b>Last Broadcast:</b> ${new Date(bStats.lastBroadcast.created_at).toLocaleString()}`
			: 'No broadcasts yet';
		const message = `
📡 <b>BROADCAST STATISTICS</b>

📊 <b>Overview</b>
• Total Broadcasts: ${bStats.totalBroadcasts}
• Total Messages Sent: ${bStats.totalMessagesSent}

🕐 <b>Last Activity</b>
${lastBroadcastStr}

📋 <b>Recent Broadcasts</b>
${
	bStats.broadcasts
		.map(
			(b, i) =>
				`${i + 1}. ${new Date(b.created_at).toLocaleDateString()} - ✅ ${b.success_count}/${b.total_users} users`,
		)
		.join('\n') || 'No broadcasts'
}
`;
		await ctx.editMessageText(message, {
			parse_mode: 'HTML',
			reply_markup: {
				inline_keyboard: [
					[
						{ text: '📊 Analytics', callback_data: 'admin_analytics' },
						{ text: '📈 Stats', callback_data: 'admin_stats' },
					],
					[{ text: '« Back', callback_data: 'admin_back' }],
				],
			},
		});
	} else if (data === 'admin_back') {
		const message = `
📋 <b>ADMIN PANEL</b>

Choose an action:
`;
		await ctx.editMessageText(message, {
			parse_mode: 'HTML',
			reply_markup: {
				inline_keyboard: [
					[
						{ text: '📊 Analytics', callback_data: 'admin_analytics' },
						{ text: '📈 Stats', callback_data: 'admin_stats' },
					],
					[
						{ text: '📢 Broadcast', callback_data: 'admin_broadcast' },
						{ text: '📡 Broadcast Stats', callback_data: 'admin_broadcast_stats' },
					],
				],
			},
		});
	}

	await ctx.answerCallbackQuery();
});

bot.on('message:text', async (ctx) => {
	const text = ctx.message.text;

	// Check if admin is replying to broadcast prompt
	if (ADMIN_ID && ctx.from?.id === ADMIN_ID && ctx.message.reply_to_message?.text?.includes('BROADCAST MESSAGE')) {
		const userIds = getAllUserIds();
		if (userIds.length === 0) {
			await ctx.reply('❌ No users to broadcast to.');
			return;
		}

		await ctx.reply(`📢 Broadcasting message to ${userIds.length} users...\nThis may take a moment.`);

		let successCount = 0;
		let failureCount = 0;

		for (const userId of userIds) {
			try {
				await ctx.api.sendMessage(userId, text, { parse_mode: 'HTML' });
				successCount++;
			} catch (error) {
				log('WARN', `Failed to send broadcast to user ${userId}`, error);
				failureCount++;
			}
		}

		log('INFO', `Broadcast completed`, {
			totalUsers: userIds.length,
			successCount,
			failureCount,
			message: text,
		});

		// Save broadcast statistics
		saveBroadcast(ctx.from!.id, text, userIds.length, successCount, failureCount);

		await ctx.reply(
			`✅ Broadcast completed!\n\n📊 Results:\n• Sent: ${successCount}/${userIds.length}\n• Failed: ${failureCount}/${userIds.length}`,
		);
		return;
	}

	if (isValidMediaUrl(text)) {
		log('INFO', `Media URL received from user`, {
			userId: ctx.from?.id,
			username: ctx.from?.username || 'N/A',
			url: text,
		});

		try {
			await ctx.reply('🔄 Fetching media...');
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
				} else if (errorMsg.includes('unsupported')) {
					userMessage = "❌ Instagram is supported, but I couldn't recognize your link. Have you pasted the right one?";
				} else if (errorMsg.includes('youtube.login')) {
					userMessage =
						"❌ YouTube downloading is temporarily disabled due to restrictions from YouTube's side. We're already looking for ways to go around them.";
				}
				log('WARN', `Download failed for user`, {
					userId: ctx.from?.id,
					username: ctx.from?.username,
					error: errorMsg,
				});
				return await ctx.reply(userMessage);
			}

			// Track metrics for performance monitoring
			trackMetric(response.elapsedMs);
			logMetricsIfNeeded();

			await ctx.api.sendChatAction(ctx.chat.id, 'upload_video');
			const caption = `⏱ ${(response.elapsedMs / 1000).toFixed(2)}s | @SaveReelsNowBot`;
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
