import { Bot } from 'grammy';
import { adminCommand } from './admin.js';
import { statsCommand } from './stats.js';
import { broadcastCommand } from './broadcast.js';

export const registerAdminCommands = (bot: Bot) => {
  bot.command('admin', adminCommand);
  bot.command('stats', statsCommand);
  bot.command('broadcast', broadcastCommand);
};