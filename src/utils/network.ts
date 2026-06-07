import { HttpError } from 'grammy';

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const isNetworkResetError = (error: unknown): boolean => {
  if (!(error instanceof HttpError)) return false;

  const maybeErr = error as any;
  const nested = maybeErr?.error || maybeErr?.cause;
  const code = nested?.code;
  const message = String(nested?.message || maybeErr?.message || '');

  return (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    message.includes('socket connection was closed unexpectedly')
  );
};

export const withTelegramNetworkRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  log: (level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) => void,
): Promise<T> => {
  let attempt = 0;
  const maxRetries = 2;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isNetworkResetError(error) || attempt >= maxRetries) {
        throw error;
      }

      attempt++;
      const backoffMs = 400 * attempt;
      log('WARN', `[retry] Telegram call failed, retrying`, {
        operationName,
        attempt,
        maxRetries,
        error,
      });
      await delay(backoffMs);
    }
  }
};