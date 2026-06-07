import { Context, InputFile } from 'grammy';
import { BOT_TOKEN } from '../../config/constants.js';
import { squircleCrop } from '../../squircle.ts';
import { log } from '../../logger/index.js';

export const registerPhotoHandler = (bot: any) => {
  bot.on('message:photo', async (ctx: Context) => {
    if (ctx.from) {
      // user tracking handled by middleware
    }

    const photos = ctx.message.photo;
    const largestPhoto = photos[photos.length - 1];

    if (!largestPhoto) {
      log('WARN', 'Photo handler: no photo found in message', { userId: ctx.from?.id });
      await ctx.reply('❌ Could not process this image. Please try again.');
      return;
    }

    log('INFO', 'Photo handler: received photo', {
      userId: ctx.from?.id,
      fileId: largestPhoto.file_id,
      width: largestPhoto.width,
      height: largestPhoto.height,
      fileSize: largestPhoto.file_size,
    });

    const processingMsg = await ctx.reply('⏳ <b>Processing your image...</b>', { parse_mode: 'HTML' });

    try {
      await ctx.api.sendChatAction(ctx.chat.id, 'upload_photo');

      log('INFO', 'Photo handler: fetching file info from Telegram', {
        fileId: largestPhoto.file_id,
      });
      const file = await ctx.api.getFile(largestPhoto.file_id);
      log('INFO', 'Photo handler: got file info', {
        fileId: file.file_id,
        filePath: file.file_path,
        fileSize: file.file_size,
      });

      if (!file.file_path) {
        log('WARN', 'Photo handler: no file_path returned from Telegram');
        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          '❌ Could not download this image. The file may be too large.',
        );
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      log('INFO', 'Photo handler: downloading image', { fileUrl });

      const response = await fetch(fileUrl);
      if (!response.ok) {
        log('ERROR', 'Photo handler: failed to download image', {
          status: response.status,
          statusText: response.statusText,
        });
        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          '❌ Failed to download image. Please try again.',
        );
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      log('INFO', 'Photo handler: image downloaded', {
        bytes: arrayBuffer.byteLength,
      });

      const imageBuffer = Buffer.from(arrayBuffer);
      log('INFO', 'Photo handler: calling squircleCrop', {
        bufferSize: imageBuffer.length,
      });

      const resultBuffer = await squircleCrop(imageBuffer);
      log('INFO', 'Photo handler: squircleCrop succeeded', {
        resultSize: resultBuffer.length,
      });

      await ctx.api.deleteMessage(processingMsg.chat.id, processingMsg.message_id).catch(() => undefined);
      await ctx.replyWithPhoto(new InputFile(resultBuffer, 'squircle.png'), {
        caption: '✅ Squircle crop applied! | @SaveReelsNowBot',
      });

      log('INFO', `Squircle photo processed for user`, {
        userId: ctx.from?.id,
        username: ctx.from?.username || 'N/A',
        originalSize: `${largestPhoto.width}x${largestPhoto.height}`,
      });
    } catch (error: any) {
      log('ERROR', `Squircle processing failed`, {
        userId: ctx.from?.id,
        errorName: error?.name,
        errorMessage: error?.message,
        errorStack: error?.stack,
        error,
      });
      try {
        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          '❌ <b>Failed to process image</b>\n\nPlease try again with a different photo.',
          { parse_mode: 'HTML' },
        );
      } catch {
        await ctx.reply('❌ Failed to process image. Please try again.');
      }
    }
  });
};