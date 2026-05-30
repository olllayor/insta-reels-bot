import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { generateMaskSvg } from './squircle.js';

const runCommandCapture = (command: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(`${command} failed with code ${code}: ${stderr || stdout}`));
    });
  });

const runCommand = async (command: string, args: string[]): Promise<void> => {
  await runCommandCapture(command, args);
};

const getVideoInfo = async (inputPath: string): Promise<{ width: number; height: number; hasAudio: boolean }> => {
  const output = await runCommandCapture('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=width,height,codec_type',
    '-of',
    'json',
    inputPath,
  ]);

  let parsed: any;
  try {
    parsed = JSON.parse(output);
  } catch (error: any) {
    throw new Error(`Failed to parse ffprobe output: ${error?.message || error}`);
  }

  const streams: any[] = parsed?.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const hasAudio = streams.some((s) => s.codec_type === 'audio');

  const width = Number(videoStream?.width || 0);
  const height = Number(videoStream?.height || 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Unable to determine video dimensions');
  }

  return { width, height, hasAudio };
};

// Cache rendered mask PNGs by pixel size — the SVG render is deterministic so we
// can skip re-encoding on repeated calls with the same dimensions.
const maskCache = new Map<number, Buffer>();

const getMaskPng = async (size: number): Promise<Buffer> => {
  const cached = maskCache.get(size);
  if (cached) return cached;
  // No background — transparent outside the squircle, matching the photo path's mask.
  const svg = generateMaskSvg(size);
  const buffer = await sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
  maskCache.set(size, buffer);
  return buffer;
};

const normalizeEvenSize = (size: number): number => {
  const normalized = Math.max(2, Math.round(size));
  return normalized % 2 === 0 ? normalized : normalized - 1;
};

export async function squircleCropVideo(inputPath: string, outputPath: string, outputSize?: number): Promise<void> {
  // Always query the file so we can detect audio regardless of whether outputSize is set.
  const { width, height, hasAudio } = await getVideoInfo(inputPath);
  const targetSize = normalizeEvenSize(outputSize ?? Math.min(width, height));
  if (!Number.isFinite(targetSize) || targetSize <= 0) {
    throw new Error('Invalid output size');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'reel-bot-mask-'));
  try {
    // Use cached mask PNG to skip the SVG→PNG render on repeat calls of the same size.
    const maskPngBuffer = await getMaskPng(targetSize);
    const maskPath = join(tempDir, 'squircle-mask.png');
    await writeFile(maskPath, maskPngBuffer);

    // alphaextract reads the PNG alpha channel — identical to what sharp's dest-in uses for photos.
    const filter =
      `[0:v]scale=${targetSize}:${targetSize}:force_original_aspect_ratio=increase,` +
      `crop=${targetSize}:${targetSize},format=rgba[vid];` +
      `[1:v]scale=${targetSize}:${targetSize},format=rgba,alphaextract[alpha];` +
      `[vid][alpha]alphamerge[rgba];` +
      `color=black:s=${targetSize}x${targetSize}[bg];` +
      `[bg][rgba]overlay=format=auto[out]`;

    // Only include audio args when the input actually has an audio stream.
    const audioArgs: string[] = hasAudio ? ['-map', '0:a', '-c:a', 'aac', '-b:a', '128k'] : [];

    await runCommand('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inputPath,
      '-loop',
      '1',
      '-i',
      maskPath,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      ...audioArgs,
      '-c:v',
      'libx264',
      '-crf',
      '23',
      '-preset',
      'fast',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      '-movflags',
      '+faststart',
      outputPath,
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
