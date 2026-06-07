import { Context, InputFile } from 'grammy';
import { BOT_TOKEN } from '../../config/constants.js';
import { MAX_DOCUMENT_UPLOAD_BYTES, DOCUMENT_DOWNLOAD_TIMEOUT_MS } from '../../config/constants.js';
import { downloadMediaToTempFile, cleanupTempDownload } from '../../services/media/mediaDownloader.js';
import { squircleCropVideo } from '../../../squircle-video.ts';
import { log } from '../../logger/index.js';

export const registerVideoHandler = (bot: any) => {
  bot.on('message:video', async (ctx: Context) => {
    if (ctx.from) {
      // user tracking handled by middleware
    }

    const video = ctx.message.video;
    if (!video) {
      log('WARN', 'Video handler: no video found in message', { userId: ctx.from?.id });
      await ctx.reply('❌ Could not process this video. Please try again.');
      return;
    }

    log('INFO', 'Video handler: received video', {
      userId: ctx.from?.id,
      fileId: video.file_id,
      width: video.width,
      height: video.height,
      duration: video.duration,
      fileSize: video.file_size,
    });

    const processingMsg = await ctx.reply('⏳ <b>Processing your video...</b>', { parse_mode: 'HTML' });
    let downloadedFile: any;

    try {
      await ctx.api.sendChatAction(ctx.chat.id, 'upload_video');

      log('INFO', 'Video handler: fetching file info from Telegram', {
        fileId: video.file_id,
      });
      const file = await ctx.api.getFile(video.file_id);
      log('INFO', 'Video handler: got file info', {
        fileId: file.file_id,
        filePath: file.file_path,
        fileSize: file.file_size,
      });

      if (file.file_size && file.file_size > MAX_DOCUMENT_UPLOAD_BYTES) {
        log('WARN', 'Video handler: file too large, rejecting early', {
          fileSize: file.file_size,
          maxBytes: MAX_DOCUMENT_UPLOAD_BYTES,
        });
        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          `❌ Video is too large. Maximum supported size is ${MAX_DOCUMENT_UPLOAD_BYTES / (1024 * 1024)}MB.`,
        );
        return;
      }

      if (!file.file_path) {
        log('WARN', 'Video handler: no file_path returned from Telegram');
        await ctx.api.editMessageText(
          processingMsg.chat.id,
          processingMsg.message_id,
          '❌ Could not download this video. The file may be too large.',
        );
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;
      log('INFO', 'Video handler: downloading video', { fileUrl });

      downloadedFile = await downloadMediaToTempFile(fileUrl, MAX_DOCUMENT_UPLOAD_BYTES, DOCUMENT_DOWNLOAD_TIMEOUT_MS);

      const outputPath = `${downloadedFile.dir}/squircle-${Date.now()}.mp4`;
      await squircleCropVideo(downloadedFile.path, outputPath);

      await ctx.api.deleteMessage(processingMsg.chat.id, processingMsg.message_id).catch(() => undefined);
      await ctx.replyWithVideo(new InputFile(outputPath, 'squircle.mp4'), {
        caption: '✅ Squircle crop applied! | @SaveReelsNowBot',
      });

      log('INFO', `Squircle video processed for user`, {
        userId: ctx.from?.id,
        username: ctx.from?.username || 'N/A',
        originalSize: `${video.width}x${video.height}`,
      });
    } catch (error: any) {
      const errorMessage = String(error?.message || error);
      const isMissingFfmpeg = error?.code === 'ENOENT';

      log('ERROR', `Squircle video processing failed`, {
        userId: ctx.from?.id,
        errorName: error?.name,
        errorMessage,
        errorStack: error?.stack,
        error,
      });

      const userMessage = isMissingFfmpeg
        ? '❌ <b>Video processing unavailable</b>\n\nThis feature requires ffmpeg (and ffprobe) to be installed on the server.'
        : '❌ <b>Failed to process video</b>\n\nPlease try again with a different video.';

      try {
        await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, userMessage, {
          parse_mode: 'HTML',
        });
      } catch {
        await ctx.reply('❌ Failed to process video. Please try again.');
      }
    } finally {
      await cleanupTempDownload(downloadedFile);
    }
  });
};