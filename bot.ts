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

// Inline query handler for inline mode
bot.on('inline_query', async (ctx) => {
	const query = ctx.inlineQuery.query.trim();

	if (!query) {
		// Empty query - provide helpful suggestion
		const helpResult: any = {
			type: 'article',
			id: 'help_inline',
			title: '🎬 Share Media with SaveReelsNowBot',
			description: 'Paste a media URL to instantly download videos from Instagram, TikTok, YouTube, and more',
			input_message_content: {
				message_text:
					"Send me a media link (Instagram, TikTok, YouTube, etc.) and I'll fetch the video for you!\n\nSupported: Instagram, TikTok, Twitter/X, YouTube, Facebook, Reddit, Vimeo, Twitch, Snapchat, SoundCloud, Pinterest, Streamable, Dailymotion, Bilibili, Bluesky, Loom, OK, Newgrounds, Rutube, Tumblr, VK, Xiaohongshu",
				parse_mode: 'HTML',
			},
			reply_markup: {
				inline_keyboard: [[{ text: '💬 Start Chat', url: 'https://t.me/SaveReelsNowBot' }]],
			},
		};
		await ctx.answerInlineQuery([helpResult], { cache_time: 3600 });
		return;
	}

	if (!isValidMediaUrl(query)) {
		// Invalid URL format - provide helpful error message
		const errorResult: any = {
			type: 'article',
			id: 'error_invalid_url',
			title: '❌ Invalid URL',
			description: 'Please provide a valid media URL',
			input_message_content: {
				message_text:
					"❌ This doesn't look like a valid media URL.\n\nPlease paste a link from: Instagram, TikTok, YouTube, Twitter/X, Facebook, Reddit, Vimeo, Twitch, or other supported platforms.",
				parse_mode: 'HTML',
			},
		};
		await ctx.answerInlineQuery([errorResult], { cache_time: 300 });
		return;
	}

	try {
		log('INFO', `Inline query received from user`, {
			userId: ctx.from?.id,
			username: ctx.from?.username || 'N/A',
			query: query,
		});

		const response = await downloadInstagramContent(query);

		if (!response.success) {
			// On error, provide error result with message
			const errorMsg = (response as any).error;
			let userFriendlyError = '❌ Download failed';
			if (errorMsg.includes('rate-limit') || errorMsg.includes('login required')) {
				userFriendlyError = '⚠️ Service temporarily unavailable. Please try again later.';
			} else if (errorMsg.includes('not available')) {
				userFriendlyError = '❌ Content not available (private account or deleted).';
			} else if (errorMsg.includes('timeout')) {
				userFriendlyError = '⏱️ Request timed out. Please try again.';
			} else if (errorMsg.includes('unsupported')) {
				userFriendlyError = '❌ Unsupported URL format.';
			}

			const errorResult: any = {
				type: 'article',
				id: `error_${Date.now()}`,
				title: userFriendlyError,
				description: 'Tap to see details',
				input_message_content: {
					message_text: userFriendlyError,
					parse_mode: 'HTML',
				},
			};
			await ctx.answerInlineQuery([errorResult], { cache_time: 60 });

			log('WARN', `Inline download failed`, {
				userId: ctx.from?.id,
				error: errorMsg,
			});
			return;
		}

		trackMetric(response.elapsedMs);
		logMetricsIfNeeded();

		// Get file size
		let fileSizeMB = 0;
		try {
			const headResponse = await fetch(response.url, {
				method: 'HEAD',
				signal: AbortSignal.timeout(3000),
			});
			const contentLength = headResponse.headers.get('content-length');
			if (contentLength) {
				fileSizeMB = parseInt(contentLength) / (1024 * 1024);
			}
		} catch (err) {
			log('WARN', `Failed to check file size for inline query`, { error: err });
		}

		const responseTimeS = (response.elapsedMs / 1000).toFixed(2);
		const MAX_VIDEO_SIZE_MB = 45;
		const statusEmoji = fileSizeMB > MAX_VIDEO_SIZE_MB ? '⚠️' : '✅';
		const sizeInfo = fileSizeMB > 0 ? `${fileSizeMB.toFixed(1)}MB` : 'calculating...';

		const results: any[] = [];

		// Primary result: Direct video
		const inlineVideoResult: any = {
			type: 'video',
			id: `video_${Date.now()}-${ctx.from?.id}`,
			video_url: response.url,
			mime_type: 'video/mp4',
			thumbnail_url: response.url,
			title: '📹 Direct Upload',
			description: `${statusEmoji} ${sizeInfo} • ⏱ ${responseTimeS}s`,
			caption: `✅ Ready to share | ⏱ ${responseTimeS}s | @SaveReelsNowBot`,
			reply_markup: {
				inline_keyboard: [
					[
						{ text: '📥 Download Link', url: response.url },
						{ text: '🔗 Share', switch_inline_query_current_chat: query },
					],
				],
			},
		};
		results.push(inlineVideoResult);

		// Secondary result: Download link article (fallback for large files)
		if (fileSizeMB > MAX_VIDEO_SIZE_MB) {
			const downloadResult: any = {
				type: 'article',
				id: `download_${Date.now()}-${ctx.from?.id}`,
				title: '📥 Download Link',
				description: `File is large (${fileSizeMB.toFixed(1)}MB) - download directly`,
				input_message_content: {
					message_text: `📹 Video Ready!\n\n⚠️ Large file (${fileSizeMB.toFixed(1)}MB)\n\n🔗 <a href="${
						response.url
					}">Download Video</a>\n\n⏱ ${responseTimeS}s | @SaveReelsNowBot`,
					parse_mode: 'HTML',
				},
				thumbnail_url: response.url,
				reply_markup: {
					inline_keyboard: [[{ text: '📥 Download', url: response.url }]],
				},
			};
			results.push(downloadResult);
		}

		await ctx.answerInlineQuery(results, {
			cache_time: 0, // Don't cache results for real-time responses
			is_personal: true, // Cache per user
		});

		log('INFO', `Inline query answered successfully`, {
			userId: ctx.from?.id,
			fileSizeMB: fileSizeMB > 0 ? fileSizeMB.toFixed(2) : 'unknown',
			responseTime: `${response.elapsedMs}ms`,
			resultsCount: results.length,
		});
	} catch (error) {
		log('ERROR', `Inline query error`, {
			userId: ctx.from?.id,
			error: error,
		});

		// Provide user-friendly error even on unexpected errors
		const fallbackResult: any = {
			type: 'article',
			id: `error_fallback_${Date.now()}`,
			title: '❌ Something went wrong',
			description: 'Please try again or contact support',
			input_message_content: {
				message_text:
					'❌ An error occurred while processing your request.\n\nPlease try again or send the link directly to the bot.',
				parse_mode: 'HTML',
			},
		};
		await ctx.answerInlineQuery([fallbackResult], { cache_time: 60 });
	}
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
			const processingMsg = await ctx.reply('⏳ <b>Processing your media...</b>', { parse_mode: 'HTML' });
			const response = await downloadInstagramContent(text);

			if (!response.success) {
				// Type narrowing: response is now DownloaderErrorResponseMinimal
				const errorMsg: string = (response as any).error;
				let userMessage = `❌ <b>Download failed</b>\n\n${errorMsg}`;
				if (errorMsg.includes('rate-limit') || errorMsg.includes('login required')) {
					userMessage =
						'⚠️ <b>Service temporarily unavailable</b>\n\nPlease try again later or with a different video.';
				} else if (errorMsg.includes('not available')) {
					userMessage =
						'❌ <b>Content not available</b>\n\nThis video might be from a private account or has been deleted.';
				} else if (errorMsg.includes('timeout')) {
					userMessage = '⏱️ <b>Request timed out</b>\n\nPlease try again.';
				} else if (errorMsg.includes('unsupported')) {
					userMessage =
						"❌ <b>Unsupported URL</b>\n\nI couldn't recognize your link. Please make sure you pasted the correct URL.";
				} else if (errorMsg.includes('youtube.login')) {
					userMessage =
						"⚠️ <b>YouTube temporarily unavailable</b>\n\nYouTube downloading is currently disabled. We're working on a fix!";
				}

				log('WARN', `Download failed for user`, {
					userId: ctx.from?.id,
					username: ctx.from?.username,
					error: errorMsg,
				});

				await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, userMessage, {
					parse_mode: 'HTML',
					reply_markup: {
						inline_keyboard: [[{ text: '🔄 Try another link', switch_inline_query: '' }]],
					},
				});
				return;
			}

			// Track metrics for performance monitoring
			trackMetric(response.elapsedMs);
			logMetricsIfNeeded();

			await ctx.api.sendChatAction(ctx.chat.id, 'upload_video');
			const responseTimeS = (response.elapsedMs / 1000).toFixed(2);

			// Try to get file size first (HEAD request is very fast, typically 50-200ms)
			let fileSizeMB = 0;
			try {
				const headResponse = await fetch(response.url, {
					method: 'HEAD',
					signal: AbortSignal.timeout(3000), // 3 second timeout
				});
				const contentLength = headResponse.headers.get('content-length');
				if (contentLength) {
					fileSizeMB = parseInt(contentLength) / (1024 * 1024);
				}
			} catch (err) {
				// If HEAD fails or times out, we'll just try to send the video anyway
				log('WARN', `Failed to check file size`, { error: err });
			}

			const MAX_VIDEO_SIZE_MB = 45; // Leave some margin
			const statusEmoji = fileSizeMB > MAX_VIDEO_SIZE_MB ? '⚠️' : '✅';
			const sizeInfo = fileSizeMB > 0 ? `${fileSizeMB.toFixed(1)}MB` : 'calculating...';

			try {
				if (fileSizeMB > 0 && fileSizeMB > MAX_VIDEO_SIZE_MB) {
					log('INFO', `Video too large (${fileSizeMB.toFixed(2)}MB), sending URL instead`, {
						userId: ctx.from?.id,
						url: response.url,
					});

					const message = `📹 <b>Video ready!</b>\n\n${statusEmoji} <b>File size:</b> ${sizeInfo}\n⏱ <b>Speed:</b> ${responseTimeS}s\n\n⚠️ This video is too large to upload directly.\n\n<b>Options:</b>`;

					await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, message, {
						parse_mode: 'HTML',
						reply_markup: {
							inline_keyboard: [
								[
									{ text: '📥 Download Link', url: response.url },
									{ text: '💾 Save to Downloads', url: response.url },
								],
							],
						},
						link_preview_options: { is_disabled: false },
					});
				} else {
					// Try to send video with updated message
					await ctx.api.editMessageText(
						processingMsg.chat.id,
						processingMsg.message_id,
						`📹 <b>Uploading video...</b>\n${statusEmoji} ${sizeInfo} • ⏱ ${responseTimeS}s`,
						{ parse_mode: 'HTML' },
					);

					const caption = `✅ <b>Ready!</b> ⏱ ${responseTimeS}s | @SaveReelsNowBot`;
					await ctx.api.sendVideo(ctx.chat.id, response.url, {
						supports_streaming: true,
						caption,
						parse_mode: 'HTML',
						reply_markup: {
							inline_keyboard: [
								[
									{ text: '🔗 Share Link', url: response.url },
									{ text: '📤 Share to Story', switch_inline_query: '' },
								],
							],
						},
					});

					// Delete the processing message
					try {
						await ctx.api.deleteMessage(processingMsg.chat.id, processingMsg.message_id);
					} catch (deleteErr) {
						log('WARN', `Failed to delete processing message`, { error: deleteErr });
					}

					// Send to channel for persistence and get file_id
					let fileId: string | undefined;
					try {
					// Create caption with username for group
					const username = ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'Unknown';
					const groupCaption = `✅ <b>Ready!</b> ⏱ ${responseTimeS}s | Shared by ${username}`;
					const channelMsg = await ctx.api.sendVideo('@reels_db', response.url, {
						supports_streaming: true,
						caption: groupCaption,
						parse_mode: 'HTML',
					});
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
							fileSizeMB: fileSizeMB > 0 ? fileSizeMB.toFixed(2) : 'unknown',
						});
					} catch (persistErr) {
						log('WARN', `Failed to persist video record`, { userId: ctx.from?.id, error: persistErr });
					}
				}
			} catch (sendError: any) {
				// If sendVideo fails (e.g., file too large, network error), fallback to URL
				log('WARN', `Failed to send video, falling back to URL`, {
					userId: ctx.from?.id,
					error: sendError?.message || String(sendError),
					fileSizeMB: fileSizeMB > 0 ? fileSizeMB.toFixed(2) : 'unknown',
				});

				const message = `📹 <b>Video ready!</b>\n\n${statusEmoji} <b>File size:</b> ${sizeInfo}\n⏱ <b>Speed:</b> ${responseTimeS}s\n\n⚠️ Unable to upload directly.\n\n<b>Options:</b>`;

				await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, message, {
					parse_mode: 'HTML',
					reply_markup: {
						inline_keyboard: [
							[
								{ text: '📥 Download Link', url: response.url },
								{ text: '💾 Save to Downloads', url: response.url },
							],
						],
					},
					link_preview_options: { is_disabled: false },
				});
			}
		} catch (error) {
			log('ERROR', `Download error for user`, {
				userId: ctx.from?.id,
				username: ctx.from?.username || 'N/A',
				error: error,
			});
			await ctx.reply('❌ <b>Something went wrong</b>\n\nPlease try again or contact support.', { parse_mode: 'HTML' });
		}
	}
});

bot.start();
