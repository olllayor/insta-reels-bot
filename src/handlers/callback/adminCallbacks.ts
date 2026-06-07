import { Context } from 'grammy';
import { ADMIN_ID } from '../../config/constants.js';
import { getAdminStats, getBroadcastStats } from '../../../db.ts';
import {
  getAdminSubKeyboard,
  getAdminBackKeyboard,
  getAdminPanelKeyboard,
} from '../../services/keyboard/keyboards.js';

export const registerAdminCallbacks = (bot: any) => {
  bot.on('callback_query:data', async (ctx: Context) => {
    if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) {
      await ctx.answerCallbackQuery({ text: '❌ Unauthorized', show_alert: true });
      return;
    }

    const data = ctx.callbackQuery.data;

    if (data === 'admin_analytics') {
      const stats = getAdminStats();
      const message = `
📊 <b>BOT ANALYTICS</b>

👥 <b>User Statistics</b>
• Total Users: ${stats.totalUsers}
• Today Logins: ${stats.todayLogins}
• Weekly Logins: ${stats.weeklyLogins}

🎬 <b>Video Statistics</b>
• Total Videos: ${stats.totalVideos}
• Daily Active Users: ${stats.dailyActiveUsers}
• Weekly Active Users: ${stats.weeklyActiveUsers}
• Avg Videos/User: ${stats.avgVideosPerUser}

🏆 <b>Top Users</b>
${stats.topUsers.map((u, i) => `${i + 1}. @${u.username}: ${u.videoCount} videos`).join('\n') || 'No data'}
`;
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: getAdminSubKeyboard(),
      });
    } else if (data === 'admin_stats') {
      const adminStats = getAdminStats();
      const message = `
📊 <b>DETAILED STATISTICS</b>

🔹 <b>Engagement Metrics</b>
  Today Login Rate: ${
    adminStats.totalUsers > 0 ? ((adminStats.todayLogins / adminStats.totalUsers) * 100).toFixed(1) : 0
  }%
  Weekly Login Rate: ${
    adminStats.totalUsers > 0 ? ((adminStats.weeklyLogins / adminStats.totalUsers) * 100).toFixed(1) : 0
  }%
  Daily Activity: ${adminStats.dailyActiveUsers} users (${
    adminStats.totalUsers > 0 ? ((adminStats.dailyActiveUsers / adminStats.totalUsers) * 100).toFixed(1) : 0
  }%)
  Weekly Activity: ${adminStats.weeklyActiveUsers} users (${
    adminStats.totalUsers > 0 ? ((adminStats.weeklyActiveUsers / adminStats.totalUsers) * 100).toFixed(1) : 0
  }%)

🔹 <b>Content</b>
  Total Videos Processed: ${adminStats.totalVideos}
  Avg Videos per User: ${adminStats.avgVideosPerUser}
`;
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: getAdminSubKeyboard(),
      });
    } else if (data === 'admin_broadcast') {
      await ctx.editMessageText(
        '📢 <b>BROADCAST MESSAGE</b>\n\nPlease reply with the message you want to broadcast to all users.\n\n(You can use HTML formatting)',
        {
          parse_mode: 'HTML',
          reply_markup: getAdminSubKeyboard(),
        },
      );
    } else if (data === 'admin_broadcast_stats') {
      const bStats = getBroadcastStats();
      const lastBroadcastStr = bStats.lastBroadcast
        ? `<b>Last Broadcast:</b> ${new Date(bStats.lastBroadcast.created_at).toLocaleString()}`
        : 'No broadcasts yet';
      const message = `
📡 <b>BROADCAST STATISTICS</b>

📊 <b>Overview</b>
• Total Broadcasts: ${bStats.totalBroadcasts}
• Total Messages Sent: ${bStats.totalMessagesSent}

🕐 <b>Last Activity</b>
${lastBroadcastStr}

📋 <b>Recent Broadcasts</b>
${
  bStats.broadcasts
    .map(
      (b, i) =>
        `${i + 1}. ${new Date(b.created_at).toLocaleDateString()} - ✅ ${b.success_count}/${b.total_users} users`,
    )
    .join('\n') || 'No broadcasts'
}
`;
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: getAdminSubKeyboard(),
      });
    } else if (data === 'admin_back') {
      const message = `
📋 <b>ADMIN PANEL</b>

Choose an action:
`;
      await ctx.editMessageText(message, {
        parse_mode: 'HTML',
        reply_markup: getAdminPanelKeyboard(),
      });
    }

    await ctx.answerCallbackQuery();
  });
};