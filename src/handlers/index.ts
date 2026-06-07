import { Bot } from 'grammy';
import { registerAdminCallbacks } from './callback/adminCallbacks.js';
import { registerInlineQueryHandler } from './inline/inlineQuery.js';
import { registerMessageHandlers } from './message/index.js';

export const registerHandlers = (bot: Bot) => {
  registerAdminCallbacks(bot);
  registerInlineQueryHandler(bot);
  registerMessageHandlers(bot);
};