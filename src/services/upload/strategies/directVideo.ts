import { UploadStrategy } from './uploadStrategy.js';
import { UploadContext, DeliveryResult } from '../types.js';
import { getDirectVideoKeyboard } from '../../../services/keyboard/keyboards.js';
import { log } from '../../../logger/index.js';

export const directVideoStrategy: UploadStrategy = {
  canHandle(context: UploadContext): boolean {
    const { fileSizeMB } = context;
    const MAX_DIRECT_VIDEO_SIZE_MB = 45;
    return fileSizeMB > 0 && fileSizeMB <= MAX_DIRECT_VIDEO_SIZE_MB;
  },

  async execute(context: UploadContext): Promise<DeliveryResult> {
    const { bot, chatId, playableUrl, caption, processingMsg, from, maxQualityUrl, statusEmoji, sizeInfo, responseTimeS } = context;

    try {
      await bot.api.sendChatAction(chatId, 'upload_video');
      await bot.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        `📹 <b>Uploading video...</b>\n${statusEmoji} ${sizeInfo} • ⏱ ${responseTimeS}s`,
        { parse_mode: 'HTML' },
      );

      const sentVideo = await bot.api.sendVideo(chatId, playableUrl, {
        supports_streaming: true,
        caption,
        parse_mode: 'HTML',
        reply_markup: getDirectVideoKeyboard(maxQualityUrl),
      });

      const result: DeliveryResult = { stage: 'direct_video', fileId: sentVideo.video?.file_id };

      try {
        await bot.api.deleteMessage(processingMsg.chat.id, processingMsg.message_id);
      } catch (deleteErr) {
        log('WARN', '[direct_video] Failed to delete processing message', {
          userId: from.id,
          errorSource: 'telegram.deleteMessage',
          error: deleteErr,
        });
      }

      return result;
    } catch (sendError: any) {
      log('WARN', '[direct_video] Failed to upload', {
        userId: from.id,
        fileSizeMB: sizeInfo,
        errorSource: 'telegram.sendVideo',
        error: sendError?.message || String(sendError),
      });
      throw sendError;
    }
  },
};