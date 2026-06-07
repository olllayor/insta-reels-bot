import { BotError, GrammyError, HttpError } from 'grammy';
import { log } from '../logger/index.js';
import { isNetworkResetError } from '../utils/network.js';

export const errorHandler = (err: BotError) => {
  const ctx = err.ctx;

  if (err.error instanceof GrammyError) {
    log('ERROR', 'Telegram API returned an application error', {
      updateId: ctx.update.update_id,
      userId: ctx.from?.id,
      description: err.error.description,
      code: err.error.error_code,
    });
    return;
  }

  if (err.error instanceof HttpError) {
    const level: 'WARN' | 'ERROR' = isNetworkResetError(err.error) ? 'WARN' : 'ERROR';
    log(level, 'Telegram HTTP/network error while processing update', {
      updateId: ctx.update.update_id,
      userId: ctx.from?.id,
      error: err.error,
    });
    return;
  }

  log('ERROR', 'Unhandled bot error', {
    updateId: ctx.update.update_id,
    userId: ctx.from?.id,
    error: err.error,
  });
};