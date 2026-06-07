import { UploadContext, DeliveryResult } from './types.js';
import { UploadStrategy } from './strategies/uploadStrategy.js';
import { directVideoStrategy } from './strategies/directVideo.js';
import { documentRetryStrategy } from './strategies/documentRetry.js';
import { linkOnlyStrategy } from './strategies/linkOnly.js';
import { sendToArchiveChannel } from '../archive/archiveChannel.js';
import { saveUserAndVideo } from '../../../db.ts';
import { log } from '../../logger/index.js';

const strategies: UploadStrategy[] = [
  linkOnlyStrategy,
  directVideoStrategy,
  documentRetryStrategy,
];

export const uploadVideo = async (
  bot: any,
  context: UploadContext,
): Promise<DeliveryResult> => {
  let deliveryResult: DeliveryResult = { stage: 'link_only' };
  let directUploadError: unknown;

  for (const strategy of strategies) {
    if (!strategy.canHandle(context)) continue;

    try {
      deliveryResult = await strategy.execute(context);
      break;
    } catch (error) {
      if (strategy === directVideoStrategy) {
        directUploadError = error;
        continue;
      }
      throw error;
    }
  }

  const { from, playableUrl, maxQualityUrl, originalUrl, caption, deliveryResult: finalResult } = 
    { ...context, deliveryResult };

  let archivedFileId = deliveryResult.fileId;
  try {
    archivedFileId = await sendToArchiveChannel(bot, deliveryResult, playableUrl, caption);
  } catch (channelErr) {
    log('WARN', `[${deliveryResult.stage}] Failed to send to archive channel`, {
      userId: from.id,
      errorSource: 'telegram.archive',
      error: channelErr,
    });
  }

  try {
    saveUserAndVideo(from, playableUrl, originalUrl, archivedFileId || deliveryResult.fileId);
    log('INFO', `[${deliveryResult.stage}] Video successfully saved for user`, {
      userId: from.id,
      username: from.username || 'N/A',
      hasFileId: !!(archivedFileId || deliveryResult.fileId),
      fileSizeMB: context.fileSizeMB > 0 ? context.fileSizeMB.toFixed(2) : 'unknown',
    });
  } catch (persistErr) {
    log('WARN', `[${deliveryResult.stage}] Failed to persist video record`, {
      userId: from.id,
      errorSource: 'db.saveUserAndVideo',
      error: persistErr,
    });
  }

  return deliveryResult;
};