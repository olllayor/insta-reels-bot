import { Context } from 'grammy';
import { isValidMediaUrl } from '../../tools.ts';
import { resolveDeliverableVideo } from '../../services/videoResolver.js';
import { uploadVideo } from '../../services/upload/uploadService.js';
import { buildLinkOptionsKeyboard, createLinkOnlyMessage, getTryAgainKeyboard } from '../../services/keyboard/keyboards.js';
import { MAX_DIRECT_VIDEO_SIZE_MB, MAX_DOCUMENT_UPLOAD_SIZE_MB } from '../../config/constants.js';
import { trackMetric, logMetricsIfNeeded, log } from '../../logger/index.js';
import { withTelegramNetworkRetry } from '../../middleware/networkRetry.js';
import { saveUserAndVideo } from '../../db.ts';

export const registerTextHandler = (bot: any) => {
  bot.on('message:text', async (ctx: Context) => {
    const text = ctx.message.text;

    // Check if admin is replying to broadcast prompt
    if (ctx.from?.id === bot.ADMIN_ID && ctx.message.reply_to_message?.text?.includes('BROADCAST MESSAGE')) {
      // This is handled by broadcast command directly
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
        const response = await resolveDeliverableVideo(text, async (msg) => {
          await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, msg, { parse_mode: 'HTML' });
        });

        if (!response.success) {
          const errorMsg: string = (response as any).error;
          let userMessage = `❌ <b>Download failed</b>\n\n${errorMsg}`;
          if (errorMsg.includes('rate-limit') || errorMsg.includes('login required')) {
            userMessage = '⚠️ <b>Service temporarily unavailable</b>\n\nPlease try again later or with a different video.';
          } else if (errorMsg.includes('not available')) {
            userMessage = '❌ <b>Content not available</b>\n\nThis video might be from a private account or has been deleted.';
          } else if (errorMsg.includes('timeout')) {
            userMessage = '⏱️ <b>Request timed out</b>\n\nPlease try again.';
          } else if (errorMsg.includes('unsupported')) {
            userMessage = "❌ <b>Unsupported URL</b>\n\nI couldn't recognize your link. Please make sure you pasted the correct URL.";
          } else if (errorMsg.includes('youtube.login')) {
            userMessage = "⚠️ <b>YouTube temporarily unavailable</b>\n\nYouTube downloading is currently disabled. We're working on a fix!";
          }

          log('WARN', `Download failed for user`, {
            userId: ctx.from?.id,
            username: ctx.from?.username,
            error: errorMsg,
          });

          await ctx.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, userMessage, {
            parse_mode: 'HTML',
            reply_markup: getTryAgainKeyboard(),
          });
          return;
        }

        const { playableUrl, maxQualityUrl, usedFallback, elapsedMs, fileSizeMB } = response;

        trackMetric(elapsedMs);
        logMetricsIfNeeded();

        const responseTimeS = (elapsedMs / 1000).toFixed(2);

        const statusEmoji = fileSizeMB > MAX_DIRECT_VIDEO_SIZE_MB ? '⚠️' : '✅';
        const sizeInfo = fileSizeMB > 0 ? `${fileSizeMB.toFixed(1)}MB` : 'calculating...';
        const fallbackNote = usedFallback ? ' • 📥 Tap "Open Download Link" for HD' : '';
        const caption = `✅ <b>Ready!</b> ⏱ ${responseTimeS}s${fallbackNote} | @SaveReelsNowBot`;
        const linkOptionsKeyboard = buildLinkOptionsKeyboard(maxQualityUrl, text);
        const shouldSkipAllUploads = fileSizeMB > 0 && fileSizeMB > MAX_DOCUMENT_UPLOAD_SIZE_MB;

        const uploadContext = {
          bot,
          chatId: ctx.chat.id,
          playableUrl,
          maxQualityUrl,
          originalUrl: text,
          caption,
          processingMsg,
          fileSizeMB,
          responseTimeS,
          statusEmoji,
          sizeInfo,
          from: ctx.from!,
        };

        const deliveryResult = await uploadVideo(bot, uploadContext);

        if (deliveryResult.stage === 'link_only' && shouldSkipAllUploads) {
          // Already handled by linkOnlyStrategy
        }
      } catch (error) {
        log('ERROR', `Download error for user`, {
          userId: ctx.from?.id,
          username: ctx.from?.username || 'N/A',
          error: error,
        });
        try {
          await withTelegramNetworkRetry(
            () =>
              ctx.reply('❌ <b>Something went wrong</b>\n\nPlease try again or contact support.', {
                parse_mode: 'HTML',
              }),
            'message:text:reply_error_fallback',
          );
        } catch (replyErr) {
          log('WARN', 'Failed to send fallback error message to user', {
            userId: ctx.from?.id,
            error: replyErr,
          });
        }
      }
    }
  });
};