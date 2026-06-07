import { Bot, GrammyError, HttpError } from 'grammy';

export interface DownloaderSuccessResponseMinimal {
  success: true;
  url: string;
  elapsedMs: number;
}

export interface DownloaderErrorResponseMinimal {
  success: false;
  error: string;
  elapsedMs: number;
}

export type DownloaderResponse = DownloaderSuccessResponseMinimal | DownloaderErrorResponseMinimal;

export type UploadStage = 'direct_video' | 'document_retry' | 'link_only';

export interface DeliveryResult {
  stage: UploadStage;
  fileId?: string;
}

export interface DownloadedTempFile {
  path: string;
  dir: string;
  fileName: string;
  sizeBytes: number;
}

export interface ResolvedVideoSuccess {
  success: true;
  playableUrl: string;
  maxQualityUrl: string;
  usedFallback: boolean;
  elapsedMs: number;
  fileSizeMB: number;
}

export interface ResolvedVideoError {
  success: false;
  error: string;
  elapsedMs: number;
}

export type ResolvedVideo = ResolvedVideoSuccess | ResolvedVideoError;

export interface Metrics {
  totalRequests: number;
  totalTime: number;
  minTime: number;
  maxTime: number;
  avgTime: () => number;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogData {
  userId?: number;
  username?: string;
  [key: string]: unknown;
}

export type BotInstance = Bot;
export type GrammyErrorType = GrammyError;
export type HttpErrorType = HttpError;

export interface AdminStats {
  totalUsers: number;
  todayLogins: number;
  weeklyLogins: number;
  totalVideos: number;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  avgVideosPerUser: number;
  topUsers: Array<{ username: string; videoCount: number }>;
}

export interface BroadcastStats {
  totalBroadcasts: number;
  totalMessagesSent: number;
  lastBroadcast: { created_at: number } | null;
  broadcasts: Array<{ created_at: number; success_count: number; total_users: number }>;
}