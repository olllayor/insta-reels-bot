import { Context } from 'grammy';
import { ADMIN_ID } from '../../config/constants.js';
import { getAdminStats } from '../../db.ts';

export const statsCommand = async (ctx: Context) => {
  if (!ADMIN_ID || ctx.from?.id !== ADMIN_ID) {
    await ctx.reply('❌ You do not have permission to use this command.');
    return;
  }

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
  await ctx.reply(message, { parse_mode: 'HTML' });
};