import { Bot } from 'grammy';
import { registerPhotoHandler } from './photoHandler.js';
import { registerVideoHandler } from './videoHandler.js';
import { registerTextHandler } from './textHandler.js';

export const registerMessageHandlers = (bot: Bot) => {
  registerPhotoHandler(bot);
  registerVideoHandler(bot);
  registerTextHandler(bot);
};