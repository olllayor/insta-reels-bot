import { Bot } from 'grammy';
import 'dotenv/config';
import { BOT_TOKEN, ADMIN_ID } from './config/constants.js';
import { errorHandler } from './middleware/errorHandler.js';
import { userTracker } from './middleware/userTracker.js';
import { registerUserCommands } from './commands/user/index.js';
import { registerAdminCommands } from './commands/admin/index.js';
import { registerHandlers } from './handlers/index.js';
import { log } from './logger/index.js';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is missing in environment. Exiting to avoid restart loop.');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

(bot as any).ADMIN_ID = ADMIN_ID;

bot.use(userTracker);
bot.catch(errorHandler);

registerUserCommands(bot);
registerAdminCommands(bot);
registerHandlers(bot);

log('INFO', 'Bot initialized.');
bot.start();