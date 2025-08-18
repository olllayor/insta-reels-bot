import { Bot } from 'grammy';
import 'dotenv/config';
import { isInstagramUrl } from './tools.js';
import { downloadInstagramContent } from './downloader.js';

console.log('Bot initialized.');
const bot = new Bot(process.env.BOT_TOKEN!);

bot.command('start', async (ctx) => await ctx.reply('Welcome! Up and running.'));

bot.on('message:text', async (ctx) => {
	const text = ctx.message.text;
	if (isInstagramUrl(text)) {
		try {
			await ctx.reply('🔄 Processing your Instagram URL...');

			const response = await downloadInstagramContent(text);

			if (response.success && response.downloadUrl) {
				await ctx.api.sendChatAction(ctx.chat.id, 'upload_video');
				await ctx.api.sendVideo(ctx.chat.id, response.downloadUrl, {
					supports_streaming: true,
				});
			} else {
				await ctx.reply(`❌ Download failed: ${response.error || 'Unknown error'}`);
			}
		} catch (error) {
			await ctx.reply('❌ Failed to process the URL. Please try again.');
			console.error('Download error:', error);
		}
	}
});

bot.start();
