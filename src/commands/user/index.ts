import { Bot } from 'grammy';
import { startCommand } from './start.js';
import { helpCommand } from './help.js';

export const registerUserCommands = (bot: Bot) => {
  bot.command('start', startCommand);
  bot.command('help', helpCommand);
};