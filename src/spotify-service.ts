import type { Request, Response as ExpressResponse } from 'express';

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

  async handleStatus(_req: Request, res: ExpressResponse): Promise<void> {
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

  handleLogin(_req: Request, res: ExpressResponse): void {
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

  async handleCallback(req: Request, res: ExpressResponse): Promise<void> {
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

  async togglePlayback(): Promise<'paused' | 'playing'> {
    const playbackState = await this.getPlaybackState();
    const shouldPause = playbackState?.is_playing === true;

    const endpoint = shouldPause
      ? 'https://api.spotify.com/v1/me/player/pause'
      : 'https://api.spotify.com/v1/me/player/play';

    const response = await this.spotifyRequest(endpoint, { method: 'PUT' });
    if (!response.ok) {
      throw new Error(`Spotify toggle playback failed with status ${response.status}`);
    }

    return shouldPause ? 'paused' : 'playing';
  }

  async playPlayback(): Promise<void> {
    const response = await this.spotifyRequest('https://api.spotify.com/v1/me/player/play', { method: 'PUT' });
    if (!response.ok) {
      throw new Error(`Spotify play failed with status ${response.status}`);
    }
  }

  async pausePlayback(): Promise<void> {
    const response = await this.spotifyRequest('https://api.spotify.com/v1/me/player/pause', { method: 'PUT' });
    if (!response.ok) {
      throw new Error(`Spotify pause failed with status ${response.status}`);
    }
  }

  async nextTrack(): Promise<void> {
    const response = await this.spotifyRequest('https://api.spotify.com/v1/me/player/next', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Spotify next failed with status ${response.status}`);
    }
  }

  async previousTrack(): Promise<void> {
    const response = await this.spotifyRequest('https://api.spotify.com/v1/me/player/previous', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Spotify previous failed with status ${response.status}`);
    }
  }

  async seekBySeconds(secondsDelta: number): Promise<{ fromMs: number; toMs: number }> {
    const playback = await this.getPlaybackSnapshot();
    if (!playback) {
      throw new Error('No active playback');
    }

    const fromMs = Math.max(0, playback.progressMs);
    const targetMs = Math.max(0, fromMs + Math.round(secondsDelta * 1000));
    await this.seekToPositionMs(targetMs);

    return { fromMs, toMs: targetMs };
  }

  async seekToPositionMs(positionMs: number): Promise<void> {
    const targetMs = Math.max(0, Math.round(positionMs));
    const response = await this.spotifyRequest(`https://api.spotify.com/v1/me/player/seek?position_ms=${targetMs}`, {
      method: 'PUT',
    });

    if (!response.ok) {
      throw new Error(`Spotify seek failed with status ${response.status}`);
    }
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

  private async refreshTokenIfNeeded(force = false): Promise<void> {
    if (!this.spotifyTokens) {
      throw new Error('Spotify is not authorized');
    }

    if (!force && Date.now() < this.spotifyTokens.expiresAt) {
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

  private async getPlaybackState(): Promise<{ is_playing: boolean } | null> {
    const response = await this.spotifyRequest('https://api.spotify.com/v1/me/player');
    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Spotify playback state failed with status ${response.status}`);
    }

    const data = await response.json() as { is_playing?: boolean };
    return { is_playing: Boolean(data.is_playing) };
  }

  private async getPlaybackSnapshot(): Promise<{ progressMs: number } | null> {
    const response = await this.spotifyRequest('https://api.spotify.com/v1/me/player');
    if (response.status === 204) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Spotify playback snapshot failed with status ${response.status}`);
    }

    const data = await response.json() as { progress_ms?: number };
    return { progressMs: Math.max(0, data.progress_ms ?? 0) };
  }

  private async spotifyRequest(input: string, init?: RequestInit): Promise<globalThis.Response> {
    if (!this.spotifyTokens) {
      throw new Error('Spotify is not authorized');
    }

    await this.refreshTokenIfNeeded();

    let response = await fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${this.spotifyTokens.accessToken}`,
      },
    });

    if (response.status === 401) {
      await this.refreshTokenIfNeeded(true);
      response = await fetch(input, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${this.spotifyTokens.accessToken}`,
        },
      });
    }

    return response;
  }

  private persist(): void {
    saveJsonFile(SPOTIFY_STATE_PATH, this.spotifyTokens);
  }
}
