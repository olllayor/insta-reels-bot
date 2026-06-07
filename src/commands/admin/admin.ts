import { Context } from 'grammy';
import { ADMIN_ID } from '../../config/constants.js';
import { getAdminPanelKeyboard } from '../../services/keyboard/keyboards.js';

export const adminCommand = async (ctx: Context) => {
  if (!ADMIN_ID || ctx.from?.id !== ADMIN_ID) {
    await ctx.reply('❌ You do not have permission to use this command.');
    return;
  }

  const message = `
📋 <b>ADMIN PANEL</b>

Choose an action:
`;
  await ctx.reply(message, {
    parse_mode: 'HTML',
    reply_markup: getAdminPanelKeyboard(),
  });
};