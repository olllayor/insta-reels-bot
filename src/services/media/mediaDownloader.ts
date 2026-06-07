import { mkdtemp, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inferFileName } from '../../utils/fileName.js';
import { DownloadedTempFile } from '../../types/index.js';
import { log } from '../../logger/index.js';

export const downloadMediaToTempFile = async (
  downloadUrl: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<DownloadedTempFile> => {
  const tempDir = await mkdtemp(join(tmpdir(), 'reel-bot-'));
  const fileName = inferFileName(downloadUrl);
  const filePath = join(tempDir, fileName);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let fileHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    const response = await fetch(downloadUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Download request failed: HTTP ${response.status}`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const expectedBytes = Number.parseInt(contentLength, 10);
      if (Number.isFinite(expectedBytes) && expectedBytes > maxBytes) {
        throw new Error(`File exceeds max limit`);
      }
    }

    if (!response.body) {
      throw new Error('Download response has no body');
    }

    fileHandle = await open(filePath, 'w');
    const reader = response.body.getReader();
    let sizeBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      sizeBytes += value.byteLength;
      if (sizeBytes > maxBytes) {
        throw new Error(`File exceeds max limit`);
      }
      await fileHandle.write(value);
    }

    await fileHandle.close();
    fileHandle = undefined;

    return {
      path: filePath,
      dir: tempDir,
      fileName,
      sizeBytes,
    };
  } catch (err: any) {
    if (fileHandle) {
      await fileHandle.close().catch(() => undefined);
    }

    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);

    if (err?.name === 'AbortError') {
      throw new Error(`Download timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
};

export const cleanupTempDownload = async (downloaded?: DownloadedTempFile) => {
  if (!downloaded) return;
  await rm(downloaded.dir, { recursive: true, force: true }).catch(() => undefined);
};