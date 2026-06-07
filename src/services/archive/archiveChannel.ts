import { Bot, InputFile } from 'grammy';
import { DeliveryResult } from '../../types/index.js';
import { ARCHIVE_CHANNEL_ID } from '../../config/constants.js';
import { log } from '../../logger/index.js';

export const sendToArchiveChannel = async (
  bot: Bot,
  deliveryResult: DeliveryResult,
  playableUrl: string,
  caption: string,
): Promise<string | undefined> => {
  let archivedFileId = deliveryResult.fileId;

  try {
    if (deliveryResult.stage === 'document_retry') {
      if (deliveryResult.fileId) {
        const channelMsg = await bot.api.sendDocument(ARCHIVE_CHANNEL_ID, deliveryResult.fileId, {
          caption,
          parse_mode: 'HTML',
        });
        archivedFileId = channelMsg.document?.file_id || archivedFileId;
      } else {
        const channelMsg = await bot.api.sendDocument(ARCHIVE_CHANNEL_ID, playableUrl, {
          caption,
          parse_mode: 'HTML',
        });
        archivedFileId = channelMsg.document?.file_id;
      }
    } else {
      if (deliveryResult.fileId) {
        const channelMsg = await bot.api.sendVideo(ARCHIVE_CHANNEL_ID, deliveryResult.fileId, {
          supports_streaming: true,
          caption,
          parse_mode: 'HTML',
        });
        archivedFileId = channelMsg.video?.file_id || archivedFileId;
      } else {
        const channelMsg = await bot.api.sendVideo(ARCHIVE_CHANNEL_ID, playableUrl, {
          supports_streaming: true,
          caption,
          parse_mode: 'HTML',
        });
        archivedFileId = channelMsg.video?.file_id;
      }
    }
  } catch (channelErr) {
    log('WARN', `[${deliveryResult.stage}] Failed to send to archive channel`, {
      errorSource: 'telegram.archive',
      error: channelErr,
    });
  }

  return archivedFileId;
};