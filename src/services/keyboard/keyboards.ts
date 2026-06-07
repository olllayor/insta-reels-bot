import { InlineKeyboard } from 'grammy';

export const buildLinkOptionsKeyboard = (downloadUrl: string, originalUrl: string) =>
  new InlineKeyboard()
    .url('📥 Open Download Link', downloadUrl)
    .url('🔗 Open Original Post', originalUrl);

export const createLinkOnlyMessage = ({
  statusEmoji,
  sizeInfo,
  responseTimeS,
  reason,
}: {
  statusEmoji: string;
  sizeInfo: string;
  responseTimeS: string;
  reason: string;
}) =>
  `📹 <b>Video ready!</b>\n\n${statusEmoji} <b>File size:</b> ${sizeInfo}\n⏱ <b>Speed:</b> ${responseTimeS}s\n\n⚠️ ${reason}\n\n<b>Options:</b>`;

export const getAdminPanelKeyboard = () =>
  new InlineKeyboard()
    .text('📊 Analytics', 'admin_analytics')
    .text('📈 Stats', 'admin_stats')
    .row()
    .text('📢 Broadcast', 'admin_broadcast')
    .text('📡 Broadcast Stats', 'admin_broadcast_stats');

export const getAdminBackKeyboard = () =>
  new InlineKeyboard()
    .text('📊 Analytics', 'admin_analytics')
    .text('📈 Stats', 'admin_stats')
    .row()
    .text('📢 Broadcast', 'admin_broadcast')
    .text('📡 Broadcast Stats', 'admin_broadcast_stats');

export const getAdminSubKeyboard = () =>
  new InlineKeyboard()
    .text('📈 Stats', 'admin_stats')
    .text('📢 Broadcast', 'admin_broadcast')
    .row()
    .text('« Back', 'admin_back');

export const getInlineShareKeyboard = (downloadUrl: string, query: string) =>
  new InlineKeyboard()
    .url('📥 Download Link', downloadUrl)
    .switchInlineCurrent('🔗 Share', query);

export const getDirectVideoKeyboard = (downloadUrl: string) =>
  new InlineKeyboard()
    .url('🔗 Share Link', downloadUrl)
    .switchInline('📤 Share to Story', '');

export const getDownloadKeyboard = (downloadUrl: string) =>
  new InlineKeyboard().url('📥 Download', downloadUrl);

export const getTryAgainKeyboard = () =>
  new InlineKeyboard().switchInline('🔄 Try another link', '');