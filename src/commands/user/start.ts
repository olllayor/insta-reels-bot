import { Context } from 'grammy';
import { saveOrUpdateUser } from '../../db.ts';
import { log } from '../../logger/index.js';

export const startCommand = async (ctx: Context) => {
  try {
    if (ctx.from) {
      saveOrUpdateUser(ctx.from);
      log('INFO', `User saved or updated`, {
        userId: ctx.from.id,
        username: ctx.from.username || 'N/A',
        firstName: ctx.from.first_name,
        isFirstTime: !ctx.from.is_bot,
      });
    }
  } catch (err) {
    log('WARN', `Failed to save user ${ctx.from?.id}`, err);
  }
  await ctx.reply(
    'Send me a media link to download the video, or send me a photo or video to crop it into a squircle (iOS-style rounded square)!\n\nSupported platforms: Instagram, TikTok, Twitter/X, YouTube, Facebook, Reddit, Vimeo, Twitch, Snapchat, SoundCloud, Pinterest, Streamable, Dailymotion, Bilibili, Bluesky, Loom, OK, Newgrounds, Rutube, Tumblr, VK, Xiaohongshu',
  );
};