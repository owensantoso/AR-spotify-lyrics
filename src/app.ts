import { AppServer, AppSession, ViewType } from '@mentra/sdk';
import type { Request, Response } from 'express';

import { MENTRAOS_API_KEY, PACKAGE_NAME, PORT } from './config';
import { buildDisplayContent, buildGapContent } from './display';
import { LyricsService } from './lyrics-service';
import { RomanizationService } from './romanization-service';
import { SettingsStore } from './settings-store';
import { SpotifyService } from './spotify-service';
import { INDENT } from './types';
import { renderSavedPage, renderSettingsPage } from './webview';

type AuthenticatedRequest = Request & { authUserId?: string };

export class MentraLyricsApp extends AppServer {
  private readonly spotify = new SpotifyService();
  private readonly lyrics = new LyricsService();
  private readonly romanization = new RomanizationService();
  private readonly settings = new SettingsStore();
  private readonly lyricIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly interactionCleanup = new Map<string, Array<() => void>>();
  private readonly voiceCommandAt = new Map<string, number>();
  private readonly lastDisplayedContent = new Map<string, string>();
  private readonly lastDisplaySentAt = new Map<string, number>();
  private readonly holdDurationMs = 30000;
  private readonly resendSameContentEveryMs = 8000;
  private readonly instrumentalGapMs = 10000;

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });

    const expressApp = this.getExpressApp();

    expressApp.get('/', (_req, res) => {
      res.send('Mentra G1 lyrics app is running.');
    });

    expressApp.get('/webview', (req, res) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      res.type('html').send(renderSettingsPage(userId, this.settings.getForUser(userId)));
    });

    expressApp.get('/webview/save', (req, res) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      if (userId) {
        const settings = this.settings.updateFromQuery(userId, req.query);
        console.log(
          `[Settings] Updated settings for ${userId}: showPinyin=${settings.showPinyin} fixChineseNaiToNi=${settings.fixChineseNaiToNi} showJapaneseRomanization=${settings.showJapaneseRomanization} showKoreanRomanization=${settings.showKoreanRomanization} showOriginalBelowRomanization=${settings.showOriginalBelowRomanization} lyricOffsetMs=${settings.lyricOffsetMs} customRomanizationFrom=${settings.customRomanizationFrom} customRomanizationTo=${settings.customRomanizationTo}`,
        );
      }

      res.type('html').send(renderSavedPage());
    });

    expressApp.get('/spotify/status', async (req: Request, res: Response) => {
      await this.spotify.handleStatus(req, res);
    });

    expressApp.get('/spotify/login', (req: Request, res: Response) => {
      this.spotify.handleLogin(req, res);
    });

    expressApp.get('/spotify/callback', async (req: Request, res: Response) => {
      await this.spotify.handleCallback(req, res);
    });
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`[MentraOS] Session connected: sessionId=${sessionId} userId=${userId}`);
    this.settings.linkSession(sessionId, userId);

    if (!this.spotify.isConfigured()) {
      this.showMainText(session, 'Spotify env missing');
      return;
    }

    if (!this.spotify.isAuthorized()) {
      this.showMainText(session, 'Spotify not authed\nOpen /spotify/login');
      return;
    }

    await this.updateLyricsForSession(session, sessionId);
    this.registerPlaybackToggleHandlers(session, sessionId);
    this.registerVoicePlaybackHandlers(session, sessionId);

    const interval = setInterval(() => {
      this.updateLyricsForSession(session, sessionId).catch((error) => {
        console.error(`[Lyrics] Update failed for session ${sessionId}:`, error);
      });
    }, 1500);

    this.lyricIntervals.set(sessionId, interval);
  }

  protected override async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    const interval = this.lyricIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.lyricIntervals.delete(sessionId);
    }

    this.lastDisplayedContent.delete(sessionId);
    this.lastDisplaySentAt.delete(sessionId);
    this.voiceCommandAt.delete(sessionId);
    const cleanupHandlers = this.interactionCleanup.get(sessionId) ?? [];
    cleanupHandlers.forEach((cleanup) => cleanup());
    this.interactionCleanup.delete(sessionId);
    this.settings.unlinkSession(sessionId);
    await super.onStop(sessionId, userId, reason);
  }

  private showMainText(session: AppSession, message: string): void {
    console.log(`[MentraOS] Displaying: "${message.replace(/\n/g, ' | ')}"`);
    session.layouts.showTextWall(message, {
      view: ViewType.MAIN,
      durationMs: this.holdDurationMs,
      priority: true,
    } as { view?: ViewType; durationMs?: number });
  }

  private showMainTextIfNeeded(session: AppSession, sessionId: string, content: string): void {
    const lastContent = this.lastDisplayedContent.get(sessionId);
    const lastSentAt = this.lastDisplaySentAt.get(sessionId) ?? 0;
    const now = Date.now();
    const sameContent = lastContent === content;

    if (sameContent && (now - lastSentAt) < this.resendSameContentEveryMs) {
      return;
    }

    this.showMainText(session, content);
    this.lastDisplayedContent.set(sessionId, content);
    this.lastDisplaySentAt.set(sessionId, now);
  }

  private async updateLyricsForSession(session: AppSession, sessionId: string): Promise<void> {
    const track = await this.spotify.getCurrentlyPlaying();
    const settings = this.settings.getForSession(sessionId);

    if (!track || !track.isPlaying) {
      this.showMainTextIfNeeded(session, sessionId, 'Start Spotify playback');
      return;
    }

    console.log(`[Spotify] Now playing: ${track.name} - ${track.artists.join(', ')}`);

    const lyrics = await this.lyrics.getLyricsForTrack(track);
    if (!lyrics) {
      this.showMainTextIfNeeded(session, sessionId, `${track.name} - ${track.artists[0] ?? ''}`);
      return;
    }

    const titleLine = `${track.name} - ${track.artists[0] ?? ''}`;
    const currentIndex = this.lyrics.pickCurrentIndex(lyrics.lines, track.progressMs - settings.lyricOffsetMs);

    if (currentIndex < 0 || !lyrics.lines[currentIndex]?.text) {
      this.showMainTextIfNeeded(session, sessionId, `${titleLine}\n...`);
      return;
    }

    const nextTimeMs = lyrics.lines[currentIndex + 1]?.timeMs;
    if (typeof nextTimeMs === 'number' && (nextTimeMs - track.progressMs) > this.instrumentalGapMs) {
      this.showMainTextIfNeeded(session, sessionId, buildGapContent(titleLine));
      return;
    }

    const currentLine = lyrics.lines[currentIndex].text;
    const nextLine = lyrics.lines[currentIndex + 1]?.text ?? '';
    const afterNextLine = lyrics.lines[currentIndex + 2]?.text ?? '';

    const romanizedCurrent = await this.romanization.getRomanizedLine(currentLine, settings);
    const romanizedNext = await this.romanization.getRomanizedLine(nextLine, settings);
    const romanizedAfterNext = await this.romanization.getRomanizedLine(afterNextLine, settings);

    const content = buildDisplayContent({
      titleLine,
      currentLine,
      nextLine,
      afterNextLine,
      romanizedCurrent,
      romanizedNext,
      romanizedAfterNext,
      settings,
    });

    this.showMainTextIfNeeded(session, sessionId, content);
  }

  private registerPlaybackToggleHandlers(session: AppSession, sessionId: string): void {
    let lastToggleAt = 0;
    const canToggle = (): boolean => {
      const now = Date.now();
      if (now - lastToggleAt < 700) {
        return false;
      }
      lastToggleAt = now;
      return true;
    };

    const onRightSingleTap = async (): Promise<void> => {
      if (!canToggle()) {
        return;
      }

      try {
        const state = await this.spotify.togglePlayback();
        this.showMainText(session, state === 'paused' ? 'Spotify paused' : 'Spotify playing');
      } catch (error) {
        console.error(`[Spotify] Toggle from tap failed for session ${sessionId}:`, error);
        this.showMainText(session, 'Spotify toggle failed');
      }
    };

    const cleanupTouch = session.events.onTouchEvent('single_tap', (event) => {
      // SDK touch payload does not expose side; only use explicit right-side hints if present.
      const serialized = JSON.stringify(event).toLowerCase();
      if (serialized.includes('right')) {
        void onRightSingleTap();
      }
    });

    const cleanupButton = session.events.onButtonPress((event) => {
      const buttonId = String(event.buttonId ?? '').toLowerCase();
      const isRight = buttonId.includes('right');
      const isSingle = event.pressType === 'short';
      if (isRight && isSingle) {
        void onRightSingleTap();
      }
    });

    this.interactionCleanup.set(sessionId, [cleanupTouch, cleanupButton]);
  }

  private registerVoicePlaybackHandlers(session: AppSession, sessionId: string): void {
    const cleanupVoice = session.events.onTranscription((data) => {
      if (!data?.isFinal || !data.text) {
        return;
      }

      console.log(`[Voice] Final transcript for ${sessionId}: "${data.text}"`);
      const text = data.text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`[Voice] Normalized transcript for ${sessionId}: "${text}"`);
      if (!text.includes('spotify')) {
        console.log(`[Voice] Ignored transcript for ${sessionId}: missing spotify keyword`);
        return;
      }

      const isSkipToChorus = matchesSkipToChorus(text);
      const skipSeconds = extractSpotifyCommandSeconds(text, 'skip');
      const backSeconds = extractSpotifyCommandSeconds(text, 'back');
      const isPause = /\bspotify\b.*\bpause\b/.test(text);
      const isPlay = /\bspotify\b.*\b(play|resume)\b/.test(text);
      const isNext = /\bspotify\b.*\bnext\b.*\bsong\b/.test(text);
      const isPrevious = /\bspotify\b.*\b(previous|prev)\b.*\bsong\b/.test(text);
      const isChineseToggle = /\bspotify\b.*\bchinese\b.*\btoggle\b/.test(text);
      const isKoreanToggle = /\bspotify\b.*\bkorean\b.*\btoggle\b/.test(text);
      const isJapaneseToggle = /\bspotify\b.*\bjapanese\b.*\btoggle\b/.test(text);
      const isDelayIncrease = /\bspotify\b.*\b(delay increase|increase delay)\b/.test(text);
      const isDelayDecrease = /\bspotify\b.*\b(delay decrease|decrease delay)\b/.test(text);

      if (!isPause && !isPlay && !isNext && !isPrevious && !isSkipToChorus &&
        skipSeconds === null && backSeconds === null &&
        !isChineseToggle && !isKoreanToggle && !isJapaneseToggle &&
        !isDelayIncrease && !isDelayDecrease) {
        console.log(`[Voice] No command matched for ${sessionId}`);
        return;
      }

      const now = Date.now();
      const lastAt = this.voiceCommandAt.get(sessionId) ?? 0;
      if (now - lastAt < 1200) {
        console.log(`[Voice] Ignored transcript for ${sessionId}: throttled`);
        return;
      }
      this.voiceCommandAt.set(sessionId, now);

      if (isPause) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify pause`);
        void this.spotify.pausePlayback()
          .then(() => this.showMainText(session, 'Spotify paused'))
          .catch((error) => {
            console.error(`[Spotify] Voice pause failed for session ${sessionId}:`, error);
            this.showMainText(session, 'Pause failed');
          });
        return;
      }

      if (isPlay) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify play`);
        void this.spotify.playPlayback()
          .then(() => this.showMainText(session, 'Spotify playing'))
          .catch((error) => {
            console.error(`[Spotify] Voice play failed for session ${sessionId}:`, error);
            this.showMainText(session, 'Play failed');
          });
        return;
      }

      if (isSkipToChorus) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify skip to chorus`);
        void this.skipToNextChorus(session, sessionId);
        return;
      }

      if (isNext) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify next song`);
        void this.spotify.nextTrack()
          .then(() => this.showMainText(session, 'Spotify next track'))
          .catch((error) => {
            console.error(`[Spotify] Voice next failed for session ${sessionId}:`, error);
            this.showMainText(session, 'Next failed');
          });
        return;
      }

      if (skipSeconds !== null) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify skip ${skipSeconds}`);
        void this.spotify.seekBySeconds(skipSeconds)
          .then(() => this.showMainText(session, `Spotify skip +${skipSeconds}s`))
          .catch((error) => {
            console.error(`[Spotify] Voice skip failed for session ${sessionId}:`, error);
            this.showMainText(session, 'Skip failed');
          });
        return;
      }

      if (backSeconds !== null) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify back ${backSeconds}`);
        void this.spotify.seekBySeconds(-backSeconds)
          .then(() => this.showMainText(session, `Spotify back -${backSeconds}s`))
          .catch((error) => {
            console.error(`[Spotify] Voice back failed for session ${sessionId}:`, error);
            this.showMainText(session, 'Back failed');
          });
        return;
      }

      if (isPrevious) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify previous song`);
        void this.spotify.previousTrack()
          .then(() => this.showMainText(session, 'Spotify previous track'))
          .catch((error) => {
            console.error(`[Spotify] Voice previous failed for session ${sessionId}:`, error);
            this.showMainText(session, 'Previous failed');
          });
        return;
      }

      if (isChineseToggle) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify chinese toggle`);
        const updated = this.settings.toggleRomanizationForSession(sessionId, 'chinese');
        this.showMainText(
          session,
          updated ? `Chinese romanization ${updated.showPinyin ? 'ON' : 'OFF'}` : 'Chinese toggle failed',
        );
        return;
      }

      if (isKoreanToggle) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify korean toggle`);
        const updated = this.settings.toggleRomanizationForSession(sessionId, 'korean');
        this.showMainText(
          session,
          updated ? `Korean romanization ${updated.showKoreanRomanization ? 'ON' : 'OFF'}` : 'Korean toggle failed',
        );
        return;
      }

      if (isJapaneseToggle) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify japanese toggle`);
        const updated = this.settings.toggleRomanizationForSession(sessionId, 'japanese');
        this.showMainText(
          session,
          updated ? `Japanese romanization ${updated.showJapaneseRomanization ? 'ON' : 'OFF'}` : 'Japanese toggle failed',
        );
        return;
      }

      if (isDelayIncrease) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify delay increase`);
        const updated = this.settings.adjustDelayForSession(sessionId, 500);
        this.showMainText(
          session,
          updated ? `Lyric delay ${formatDelayMs(updated.lyricOffsetMs)}` : 'Delay update failed',
        );
        return;
      }

      if (isDelayDecrease) {
        console.log(`[Voice] Command matched for ${sessionId}: spotify delay decrease`);
        const updated = this.settings.adjustDelayForSession(sessionId, -500);
        this.showMainText(
          session,
          updated ? `Lyric delay ${formatDelayMs(updated.lyricOffsetMs)}` : 'Delay update failed',
        );
      }
    });

    const existing = this.interactionCleanup.get(sessionId) ?? [];
    this.interactionCleanup.set(sessionId, [...existing, cleanupVoice]);
  }

  private async skipToNextChorus(session: AppSession, sessionId: string): Promise<void> {
    try {
      const track = await this.spotify.getCurrentlyPlaying();
      if (!track) {
        console.log(`[Voice] Skip to chorus aborted for ${sessionId}: no active track`);
        this.showMainText(session, 'No active Spotify track');
        return;
      }

      const lyrics = await this.lyrics.getLyricsForTrack(track);
      if (!lyrics) {
        console.log(`[Voice] Skip to chorus aborted for ${sessionId}: no synced lyrics`);
        this.showMainText(session, 'No synced lyrics for chorus');
        return;
      }

      const chorus = this.lyrics.findNextChorusTime(lyrics, track.progressMs);
      if (!chorus) {
        console.log(`[Voice] Skip to chorus aborted for ${sessionId}: no chorus candidate after ${track.progressMs}ms`);
        this.showMainText(session, 'No next chorus found');
        return;
      }

      console.log(
        `[Voice] Skip to chorus seeking for ${sessionId}: target=${chorus.timeMs} source=${chorus.source} windowSize=${chorus.windowSize} score=${chorus.score}`,
      );
      await this.spotify.seekToPositionMs(chorus.timeMs);
      this.showMainText(
        session,
        `Spotify skip to chorus\n${formatTimestampMs(chorus.timeMs)} ${chorus.source === 'repeated-window' ? 'repeat block' : 'repeat line'}`,
      );
    } catch (error) {
      console.error(`[Spotify] Voice skip to chorus failed for session ${sessionId}:`, error);
      this.showMainText(session, 'Skip to chorus failed');
    }
  }
}

function formatDelayMs(value: number): string {
  const seconds = (value / 1000).toFixed(1);
  return `${seconds}s`;
}

function formatTimestampMs(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function extractSpotifyCommandSeconds(text: string, command: 'skip' | 'back'): number | null {
  if (!text.includes('spotify') || !text.includes(command)) {
    return null;
  }

  const match = text.match(new RegExp(`\\bspotify\\b(?:\\s+\\w+){0,4}\\s+\\b${command}\\b\\s+(\\d+(?:\\.\\d+)?)\\b`));
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.min(600, Math.round(value));
}

function matchesSkipToChorus(text: string): boolean {
  if (!text.includes('spotify') || !text.includes('skip')) {
    return false;
  }

  const hasChorusWord = /\b(chorus|course|choris|corus)\b/.test(text);
  if (!hasChorusWord) {
    return false;
  }

  if (/\bspotify\b.*\bskip\b.*\b(the|to|too|two)\b.*\b(chorus|course|choris|corus)\b/.test(text)) {
    return true;
  }

  return /\bspotify\b.*\bskip\b.*\b(chorus|course|choris|corus)\b/.test(text) && extractSpotifyCommandSeconds(text, 'skip') === null;
}
