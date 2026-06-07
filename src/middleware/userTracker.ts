import { Context, NextFunction } from 'grammy';
import { saveOrUpdateUser } from '../db.ts';
import { log } from '../logger/index.js';

export const userTracker = async (ctx: Context, next: NextFunction) => {
  if (ctx.from) {
    try {
      saveOrUpdateUser(ctx.from);
      log('INFO', `User saved or updated`, {
        userId: ctx.from.id,
        username: ctx.from.username || 'N/A',
        firstName: ctx.from.first_name,
        isFirstTime: !ctx.from.is_bot,
      });
    } catch (err) {
      log('WARN', `Failed to save user ${ctx.from?.id}`, err);
    }
  }
  await next();
};