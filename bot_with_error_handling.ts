import { Bot } from 'grammy';
import 'dotenv/config';
import { isInstagramUrl } from './tools.js';
import { downloadInstagramContent } from './downloader.js';
import { saveUserAndVideo, saveOrUpdateUser } from './db.js';

console.log('Bot initialized.');
const bot = new Bot(process.env.BOT_TOKEN!);

bot.command('start', async (ctx) => {
	try {
		if (ctx.from) saveOrUpdateUser(ctx.from);
	} catch {}
	await ctx.reply('Send me an Instagram Reel link (post/reel) and I will fetch the video for you.');
});

bot.on('message:text', async (ctx) => {
	const text = ctx.message.text;
	if (isInstagramUrl(text)) {
		try {
			await ctx.reply('🔄 Fetching reel...');
			const response = await downloadInstagramContent(text);
			if (!response.success) {
				// Provide user-friendly error messages
				let userMessage = `❌ Download failed: ${response.error}`;
				if (response.error.includes('rate-limit') || response.error.includes('login required')) {
					userMessage = '❌ Instagram is currently blocking requests. Please try again later or with a different reel.';
				} else if (response.error.includes('not available')) {
					userMessage = '❌ This content is not available (private account or deleted post).';
				} else if (response.error.includes('timeout')) {
					userMessage = '❌ Request timed out. Please try again.';
				}
				return await ctx.reply(userMessage);
			}
			await ctx.api.sendChatAction(ctx.chat.id, 'upload_video');
			const caption = `⏱ ${response.elapsedMs} ms | Source: Instagram`;
			await ctx.api.sendVideo(ctx.chat.id, response.url, { supports_streaming: true, caption });
			// Persist user and video
			try {
				saveUserAndVideo(ctx.from!, response.url, text);
			} catch (persistErr) {
				console.warn('Failed to persist video record:', persistErr);
			}
		} catch (error) {
			console.error('Download error:', error);
			await ctx.reply('❌ Failed to process the URL. Please try again.');
		}
	}
});

// Handle webhook deletion error gracefully
async function startBot() {
	try {
		console.log('Starting bot...');
		await bot.start();
		console.log('Bot started successfully!');
	} catch (error) {
		if (error.description === 'Not Found' && error.method === 'deleteWebhook') {
			console.log('No webhook to delete, starting with polling...');
			await bot.start({ 
				drop_pending_updates: true,
				allowed_updates: ['message'] 
			});
			console.log('Bot started with polling!');
		} else {
			console.error('Bot start error:', error);
			throw error;
		}
	}
}

startBot().catch(console.error);
