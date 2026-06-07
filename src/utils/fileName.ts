export const inferFileName = (downloadUrl: string): string => {
  try {
    const pathname = new URL(downloadUrl).pathname;
    const rawName = pathname.split('/').pop() || 'video.mp4';
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!safeName) return 'video.mp4';
    if (safeName.includes('.')) return safeName;
    return `${safeName}.mp4`;
  } catch {
    return 'video.mp4';
  }
};