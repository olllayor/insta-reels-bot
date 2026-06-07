import { UploadStrategy } from './uploadStrategy.js';
import { UploadContext, DeliveryResult } from '../types.js';
import { createLinkOnlyMessage, getDownloadKeyboard } from '../../../services/keyboard/keyboards.js';
import { log } from '../../../logger/index.js';

export const linkOnlyStrategy: UploadStrategy = {
  canHandle(context: UploadContext): boolean {
    const { fileSizeMB } = context;
    const MAX_DOCUMENT_UPLOAD_SIZE_MB = 50;
    return fileSizeMB > 0 && fileSizeMB > MAX_DOCUMENT_UPLOAD_SIZE_MB;
  },

  async execute(context: UploadContext): Promise<DeliveryResult> {
    const { bot, chatId, maxQualityUrl, processingMsg, from, statusEmoji, sizeInfo, responseTimeS, fileSizeMB } = context;

    log('INFO', '[link_only] Skipping upload, file exceeds configured upload cap', {
      userId: from.id,
      fileSizeMB: fileSizeMB.toFixed(2),
      errorSource: 'size.guard',
    });

    const message = createLinkOnlyMessage({
      statusEmoji,
      sizeInfo,
      responseTimeS,
      reason: `This video is larger than 50MB and cannot be uploaded by Telegram.`,
    });
    await bot.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, message, {
      parse_mode: 'HTML',
      reply_markup: getDownloadKeyboard(maxQualityUrl),
      link_preview_options: { is_disabled: false },
    });

    return { stage: 'link_only' };
  },
};