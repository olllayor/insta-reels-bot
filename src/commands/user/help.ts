import { Context } from 'grammy';
import { ADMIN_ID } from '../../config/constants.js';

export const helpCommand = async (ctx: Context) => {
  const isAdmin = ADMIN_ID && ctx.from?.id === ADMIN_ID;
  const message = `
📖 <b>BOT COMMANDS</b>

/start - Get started
/help - Show this message
${
  isAdmin
    ? '/admin - View bot analytics\n/stats - View detailed statistics\n/broadcast - Send message to all users'
    : ''
}

Send me a media link from any supported platform and I'll download the video for you!\n\nYou can also send me a photo or video and I'll crop it into a squircle (iOS-style rounded square with black corners).

<b>Supported Platforms:</b> Instagram, TikTok, Twitter/X, YouTube, Facebook, Reddit, Vimeo, Twitch, Snapchat, SoundCloud, Pinterest, Streamable, Dailymotion, Bilibili, Bluesky, Loom, OK, Newgrounds, Rutube, Tumblr, VK, Xiaohongshu
`;
  await ctx.reply(message, { parse_mode: 'HTML' });
};