import { UploadContext, DeliveryResult } from '../types.js';

export interface UploadStrategy {
  canHandle(context: UploadContext): boolean;
  execute(context: UploadContext): Promise<DeliveryResult>;
}