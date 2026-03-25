export const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => {
  throw new Error('PACKAGE_NAME is not set in .env file');
})();

export const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => {
  throw new Error('MENTRAOS_API_KEY is not set in .env file');
})();

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
export const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
export const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
export const SPOTIFY_SCOPE = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

export function isSpotifyConfigured(): boolean {
  return Boolean(SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET && SPOTIFY_REDIRECT_URI);
}
