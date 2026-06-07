import { downloadInstagramContent } from '../../downloader.ts';
import { ResolvedVideo } from '../types/index.js';
import { log } from '../logger/index.js';
import { QUALITY_FALLBACK_THRESHOLD_MB } from '../config/constants.js';

const headContentLengthMB = async (url: string, timeoutMs = 3000): Promise<number> => {
  try {
    const headResponse = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const contentLength = headResponse.headers.get('content-length');
    if (contentLength) {
      const bytes = parseInt(contentLength, 10);
      if (Number.isFinite(bytes) && bytes > 0) {
        return bytes / (1024 * 1024);
      }
    }
  } catch {
    // HEAD is best-effort; missing size doesn't block delivery.
  }
  return 0;
};

export const resolveDeliverableVideo = async (
  mediaUrl: string,
  onStatus?: (message: string) => Promise<void> | void,
): Promise<ResolvedVideo> => {
  const started = performance.now();

  const maxResult = await downloadInstagramContent(mediaUrl, 'max');
  if (!maxResult.success) {
    return { success: false, error: maxResult.error, elapsedMs: maxResult.elapsedMs };
  }

  const maxSizeMB = await headContentLengthMB(maxResult.url);

  if (maxSizeMB <= QUALITY_FALLBACK_THRESHOLD_MB) {
    return {
      success: true,
      playableUrl: maxResult.url,
      maxQualityUrl: maxResult.url,
      usedFallback: false,
      elapsedMs: maxResult.elapsedMs,
      fileSizeMB: maxSizeMB,
    };
  }

  log('INFO', '[resolve] max quality exceeds threshold, falling back to 1080p', {
    thresholdMB: QUALITY_FALLBACK_THRESHOLD_MB,
    maxSizeMB: maxSizeMB > 0 ? maxSizeMB.toFixed(2) : 'unknown',
    maxUrl: maxResult.url,
  });

  if (onStatus) {
    try {
      await onStatus(
        `🔎 Max quality is ${maxSizeMB > 0 ? `${maxSizeMB.toFixed(1)}MB` : 'too large'} — fetching 1080p fallback…`,
      );
    } catch {
      // status updates are best-effort
    }
  }

  const fallbackResult = await downloadInstagramContent(mediaUrl, '1080');
  if (!fallbackResult.success) {
    return {
      success: false,
      error: fallbackResult.error,
      elapsedMs: Math.round(performance.now() - started),
    };
  }

  const fallbackSizeMB = await headContentLengthMB(fallbackResult.url);

  return {
    success: true,
    playableUrl: fallbackResult.url,
    maxQualityUrl: maxResult.url,
    usedFallback: true,
    elapsedMs: maxResult.elapsedMs + fallbackResult.elapsedMs,
    fileSizeMB: fallbackSizeMB,
  };
};