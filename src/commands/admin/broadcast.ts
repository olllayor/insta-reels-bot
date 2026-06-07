import { Context } from 'grammy';
import { ADMIN_ID } from '../../config/constants.js';
import { getAllUserIds, saveBroadcast } from '../../db.ts';
import { log } from '../../logger/index.js';
import { withTelegramNetworkRetry } from '../../middleware/networkRetry.js';

export const broadcastCommand = async (ctx: Context) => {
  if (!ADMIN_ID || ctx.from?.id !== ADMIN_ID) {
    await ctx.reply('❌ You do not have permission to use this command.');
    return;
  }

  const text = ctx.message?.text || '';
  const args = text.split(' ').slice(1).join(' ') || '';
  if (!args) {
    await ctx.reply('❌ Please provide a message to broadcast.\n\nUsage: /broadcast <message>');
    return;
  }

  const userIds = getAllUserIds();
  if (userIds.length === 0) {
    await ctx.reply('❌ No users to broadcast to.');
    return;
  }

  await ctx.reply(`📢 Broadcasting message to ${userIds.length} users...\nThis may take a moment.`);

  let successCount = 0;
  let failureCount = 0;

  for (const userId of userIds) {
    try {
      await withTelegramNetworkRetry(
        () => ctx.api.sendMessage(userId, args, { parse_mode: 'HTML' }),
        'broadcast:sendMessage',
      );
      successCount++;
    } catch (error) {
      log('WARN', `Failed to send broadcast to user ${userId}`, error);
      failureCount++;
    }
  }

  log('INFO', `Broadcast completed`, {
    totalUsers: userIds.length,
    successCount,
    failureCount,
    message: args,
  });

  saveBroadcast(ctx.from!.id, args, userIds.length, successCount, failureCount);

  await ctx.reply(
    `✅ Broadcast completed!\n\n📊 Results:\n• Sent: ${successCount}/${userIds.length}\n• Failed: ${failureCount}/${userIds.length}`,
  );
};