import { DEFAULT_USER_SETTINGS, type UserSettings } from './types';
import { loadJsonFile, saveJsonFile } from './storage';

const SETTINGS_STATE_PATH = '.local/state/user-settings.json';

export class SettingsStore {
  private readonly sessionUsers = new Map<string, string>();
  private readonly userSettings: Map<string, UserSettings>;

  constructor() {
    const persisted = loadJsonFile<Record<string, UserSettings>>(SETTINGS_STATE_PATH, {});
    this.userSettings = new Map(Object.entries(persisted));
  }

  linkSession(sessionId: string, userId: string): void {
    this.sessionUsers.set(sessionId, userId);
  }

  unlinkSession(sessionId: string): void {
    this.sessionUsers.delete(sessionId);
  }

  getForSession(sessionId: string): UserSettings {
    return this.getForUser(this.sessionUsers.get(sessionId));
  }

  getForUser(userId?: string): UserSettings {
    if (!userId) {
      return { ...DEFAULT_USER_SETTINGS };
    }

    return this.userSettings.get(userId) ?? { ...DEFAULT_USER_SETTINGS };
  }

  updateFromQuery(userId: string, query: Record<string, unknown>): UserSettings {
    const settings: UserSettings = {
      showPinyin: query.showPinyin === '1',
      showJapaneseRomanization: query.showJapaneseRomanization === '1',
      showKoreanRomanization: query.showKoreanRomanization === '1',
      showOriginalBelowRomanization: query.showOriginalBelowRomanization === '1',
      lyricOffsetMs: this.parseLyricOffset(query.lyricOffsetMs),
      fixChineseNaiToNi: query.fixChineseNaiToNi === '1',
      fixChineseHuanToHai: query.fixChineseHuanToHai === '1',
      customRomanizationFrom: this.parseTextSetting(query.customRomanizationFrom),
      customRomanizationTo: this.parseTextSetting(query.customRomanizationTo),
    };

    this.userSettings.set(userId, settings);
    this.persist();
    return settings;
  }

  toggleRomanizationForSession(sessionId: string, language: 'chinese' | 'korean' | 'japanese'): UserSettings | null {
    const userId = this.sessionUsers.get(sessionId);
    if (!userId) {
      return null;
    }

    const current = this.getForUser(userId);
    const updated: UserSettings = {
      ...current,
      showPinyin: language === 'chinese' ? !current.showPinyin : current.showPinyin,
      showKoreanRomanization: language === 'korean' ? !current.showKoreanRomanization : current.showKoreanRomanization,
      showJapaneseRomanization: language === 'japanese' ? !current.showJapaneseRomanization : current.showJapaneseRomanization,
    };

    this.userSettings.set(userId, updated);
    this.persist();
    return updated;
  }

  adjustDelayForSession(sessionId: string, deltaMs: number): UserSettings | null {
    const userId = this.sessionUsers.get(sessionId);
    if (!userId) {
      return null;
    }

    const current = this.getForUser(userId);
    const updated: UserSettings = {
      ...current,
      lyricOffsetMs: this.clampDelay(current.lyricOffsetMs + deltaMs),
    };

    this.userSettings.set(userId, updated);
    this.persist();
    return updated;
  }

  private parseLyricOffset(value: unknown): number {
    const raw = typeof value === 'string' ? Number(value) : DEFAULT_USER_SETTINGS.lyricOffsetMs;
    if (!Number.isFinite(raw)) {
      return DEFAULT_USER_SETTINGS.lyricOffsetMs;
    }

    return this.clampDelay(Math.round(raw / 100) * 100);
  }

  private parseTextSetting(value: unknown): string {
    return typeof value === 'string' ? value.trim().slice(0, 40) : '';
  }

  private persist(): void {
    saveJsonFile(SETTINGS_STATE_PATH, Object.fromEntries(this.userSettings.entries()));
  }

  private clampDelay(value: number): number {
    return Math.max(-3000, Math.min(3000, value));
  }
}
