import { PACKAGE_NAME, PORT } from './config';
import { MentraLyricsApp } from './app';

const app = new MentraLyricsApp();

console.log(`[MentraOS] Starting server on port ${PORT} for package ${PACKAGE_NAME}`);

app.start().catch((error) => {
  console.error('[MentraOS] Server failed to start:', error);
});
