export type UploadStage = 'direct_video' | 'document_retry' | 'link_only';

export interface DeliveryResult {
  stage: UploadStage;
  fileId?: string;
}

export interface UploadContext {
  bot: any;
  chatId: number;
  playableUrl: string;
  maxQualityUrl: string;
  originalUrl: string;
  caption: string;
  processingMsg: { chat: { id: number }; message_id: number };
  fileSizeMB: number;
  responseTimeS: string;
  statusEmoji: string;
  sizeInfo: string;
  from: { id: number; username?: string };
}