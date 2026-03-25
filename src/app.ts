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
}
