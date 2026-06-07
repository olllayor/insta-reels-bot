import { Context } from 'grammy';
import { isValidMediaUrl } from '../../tools.ts';
import { downloadInstagramContent } from '../../downloader.ts';
import { trackMetric, logMetricsIfNeeded, log } from '../../logger/index.js';
import { MAX_DIRECT_VIDEO_SIZE_MB } from '../../config/constants.js';
import { getInlineShareKeyboard, getDownloadKeyboard } from '../../services/keyboard/keyboards.js';

export const registerInlineQueryHandler = (bot: any) => {
  bot.on('inline_query', async (ctx: Context) => {
    const query = ctx.inlineQuery.query.trim();

    if (!query) {
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
      const statusEmoji = fileSizeMB > MAX_DIRECT_VIDEO_SIZE_MB ? '⚠️' : '✅';
      const sizeInfo = fileSizeMB > 0 ? `${fileSizeMB.toFixed(1)}MB` : 'calculating...';

      const results: any[] = [];

      const inlineVideoResult: any = {
        type: 'video',
        id: `video_${Date.now()}-${ctx.from?.id}`,
        video_url: response.url,
        mime_type: 'video/mp4',
        thumbnail_url: response.url,
        title: '📹 Direct Upload',
        description: `${statusEmoji} ${sizeInfo} • ⏱ ${responseTimeS}s`,
        caption: `✅ Ready to share | ⏱ ${responseTimeS}s | @SaveReelsNowBot`,
        reply_markup: getInlineShareKeyboard(response.url, query),
      };
      results.push(inlineVideoResult);

      if (fileSizeMB > MAX_DIRECT_VIDEO_SIZE_MB) {
        const downloadResult: any = {
          type: 'article',
          id: `download_${Date.now()}-${ctx.from?.id}`,
          title: '📥 Download Link',
          description: `File is large (${fileSizeMB.toFixed(1)}MB) - download directly`,
          input_message_content: {
            message_text: `📹 Video Ready!\n\n⚠️ Large file (${fileSizeMB.toFixed(1)}MB)\n\n🔗 <a href="${response.url}">Download Video</a>\n\n⏱ ${responseTimeS}s | @SaveReelsNowBot`,
            parse_mode: 'HTML',
          },
          thumbnail_url: response.url,
          reply_markup: getDownloadKeyboard(response.url),
        };
        results.push(downloadResult);
      }

      await ctx.answerInlineQuery(results, {
        cache_time: 0,
        is_personal: true,
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
};