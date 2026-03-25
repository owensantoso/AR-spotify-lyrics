import type { Request, Response } from 'express';

import {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SPOTIFY_SCOPE,
  isSpotifyConfigured,
} from './config';
import { loadJsonFile, saveJsonFile } from './storage';
import type { SpotifyTokens, SpotifyTrack } from './types';

const SPOTIFY_STATE_PATH = '.local/state/spotify-tokens.json';

export class SpotifyService {
  private spotifyTokens: SpotifyTokens | null = loadJsonFile<SpotifyTokens | null>(SPOTIFY_STATE_PATH, null);
  private spotifyOAuthState: string | null = null;

  isConfigured(): boolean {
    return isSpotifyConfigured();
  }

  isAuthorized(): boolean {
    return this.spotifyTokens !== null;
  }

  async handleStatus(_req: Request, res: Response): Promise<void> {
    const track = await this.getCurrentlyPlaying().catch((error) => {
      return { error: error instanceof Error ? error.message : String(error) };
    });

    res.json({
      spotifyConfigured: this.isConfigured(),
      spotifyAuthorized: this.spotifyTokens !== null,
      redirectUri: SPOTIFY_REDIRECT_URI ?? null,
      nowPlaying: track,
    });
  }

  handleLogin(_req: Request, res: Response): void {
    if (!this.isConfigured()) {
      res.status(500).send('Spotify env vars missing. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI.');
      return;
    }

    this.spotifyOAuthState = crypto.randomUUID();

    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: SPOTIFY_REDIRECT_URI!,
      scope: SPOTIFY_SCOPE,
      state: this.spotifyOAuthState,
    });

    console.log('[Spotify] Starting OAuth login flow');
    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
  }

  async handleCallback(req: Request, res: Response): Promise<void> {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;

    if (!code || !state || state !== this.spotifyOAuthState) {
      res.status(400).send('Spotify login failed: invalid code or state.');
      return;
    }

    try {
      await this.exchangeCode(code);
      console.log('[Spotify] OAuth complete. Tokens stored in memory.');
      res.send('Spotify connected. Go back to Mentra and start music.');
    } catch (error) {
      console.error('[Spotify] OAuth callback failed:', error);
      res.status(500).send('Spotify login failed. Check the server logs.');
    }
  }

  async getCurrentlyPlaying(): Promise<SpotifyTrack | null> {
    if (!this.spotifyTokens) {
      console.log('[Spotify] getCurrentlyPlaying called without tokens');
      return null;
    }

    await this.refreshTokenIfNeeded();

    console.log('[Spotify] Requesting currently playing track');
    const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        Authorization: `Bearer ${this.spotifyTokens.accessToken}`,
      },
    });

    if (response.status === 204) {
      console.log('[Spotify] No active playback');
      return null;
    }

    if (!response.ok) {
      throw new Error(`Spotify currently-playing failed with status ${response.status}`);
    }

    const data = await response.json() as {
      is_playing: boolean;
      progress_ms: number;
      item?: {
        id: string;
        name: string;
        duration_ms: number;
        artists: Array<{ name: string }>;
      };
    };

    if (!data.item) {
      console.log('[Spotify] Response had no track item');
      return null;
    }

    return {
      id: data.item.id,
      name: data.item.name,
      artists: data.item.artists.map((artist) => artist.name),
      durationMs: data.item.duration_ms,
      progressMs: data.progress_ms ?? 0,
      isPlaying: data.is_playing,
    };
  }

  private async exchangeCode(code: string): Promise<void> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI!,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID!}:${SPOTIFY_CLIENT_SECRET!}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Spotify token exchange failed with status ${response.status}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.spotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.spotifyTokens?.refreshToken ?? '',
      expiresAt: Date.now() + (data.expires_in * 1000) - 60_000,
    };
    this.persist();
  }

  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.spotifyTokens) {
      throw new Error('Spotify is not authorized');
    }

    if (Date.now() < this.spotifyTokens.expiresAt) {
      return;
    }

    console.log('[Spotify] Refreshing access token');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.spotifyTokens.refreshToken,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID!}:${SPOTIFY_CLIENT_SECRET!}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Spotify token refresh failed with status ${response.status}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    this.spotifyTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.spotifyTokens.refreshToken,
      expiresAt: Date.now() + (data.expires_in * 1000) - 60_000,
    };
    this.persist();
  }

  private persist(): void {
    saveJsonFile(SPOTIFY_STATE_PATH, this.spotifyTokens);
  }
}
