import { UploadStrategy } from './uploadStrategy.js';
import { UploadContext, DeliveryResult } from '../types.js';
import { downloadMediaToTempFile, cleanupTempDownload } from '../../../services/media/mediaDownloader.js';
import { MAX_DOCUMENT_UPLOAD_BYTES, DOCUMENT_DOWNLOAD_TIMEOUT_MS } from '../../../config/constants.js';
import { createLinkOnlyMessage, getDownloadKeyboard } from '../../../services/keyboard/keyboards.js';
import { InputFile } from 'grammy';
import { log } from '../../../logger/index.js';

export const documentRetryStrategy: UploadStrategy = {
  canHandle(context: UploadContext): boolean {
    const { fileSizeMB } = context;
    const MAX_DOCUMENT_UPLOAD_SIZE_MB = 50;
    return fileSizeMB > 0 && fileSizeMB <= MAX_DOCUMENT_UPLOAD_SIZE_MB;
  },

  async execute(context: UploadContext): Promise<DeliveryResult> {
    const { bot, chatId, playableUrl, maxQualityUrl, processingMsg, from, caption, statusEmoji, sizeInfo, responseTimeS } = context;

    let downloadedFile: any;
    try {
      await bot.api.sendChatAction(chatId, 'upload_document');
      await bot.api.editMessageText(
        processingMsg.chat.id,
        processingMsg.message_id,
        `⬇️ <b>Preparing downloadable file...</b>\n${statusEmoji} ${sizeInfo} • ⏱ ${responseTimeS}s`,
        { parse_mode: 'HTML' },
      );

      downloadedFile = await downloadMediaToTempFile(
        playableUrl,
        MAX_DOCUMENT_UPLOAD_BYTES,
        DOCUMENT_DOWNLOAD_TIMEOUT_MS,
      );

      const sentDocument = await bot.api.sendDocument(
        chatId,
        new InputFile(downloadedFile.path, downloadedFile.fileName),
        {
          caption: `✅ <b>Ready as downloadable file!</b> ⏱ ${responseTimeS}s | @SaveReelsNowBot`,
          parse_mode: 'HTML',
        },
      );

      const result: DeliveryResult = { stage: 'document_retry', fileId: sentDocument.document?.file_id };

      const message = createLinkOnlyMessage({
        statusEmoji,
        sizeInfo,
        responseTimeS,
        reason: 'Uploaded as a downloadable file.',
      });
      await bot.api.editMessageText(processingMsg.chat.id, processingMsg.message_id, message, {
        parse_mode: 'HTML',
        reply_markup: getDownloadKeyboard(maxQualityUrl),
        link_preview_options: { is_disabled: false },
      });

      return result;
    } catch (documentError: any) {
      log('WARN', '[document_retry] Upload failed', {
        userId: from.id,
        errorSource: 'document_retry',
        error: documentError?.message || String(documentError),
      });
      throw documentError;
    } finally {
      await cleanupTempDownload(downloadedFile);
    }
  },
};