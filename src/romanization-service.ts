import Kuroshiro from 'kuroshiro';
import KuromojiAnalyzer from 'kuroshiro-analyzer-kuromoji';
import kroman from 'kroman';
import { pinyin } from 'pinyin-pro';

import type { UserSettings } from './types';

export class RomanizationService {
  private readonly kuroshiro = new Kuroshiro();
  private kuroshiroReady: Promise<void> | null = null;

  async getRomanizedLine(text: string, settings: UserSettings): Promise<string> {
    if (!text) {
      return '';
    }

    if (settings.showPinyin && this.containsHan(text)) {
      const romanized = pinyin(text, { toneType: 'none', type: 'array' })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      return this.applyFixes(romanized, settings);
    }

    if (settings.showJapaneseRomanization && this.containsJapanese(text)) {
      await this.ensureKuroshiroReady();
      const romanized = await this.kuroshiro.convert(text, {
        to: 'romaji',
        mode: 'spaced',
        romajiSystem: 'passport',
      });
      return this.applyFixes(romanized, settings);
    }

    if (settings.showKoreanRomanization && this.containsHangul(text)) {
      return this.applyFixes(kroman.parse(text).replace(/\s+/g, ' ').trim(), settings);
    }

    return '';
  }

  private async ensureKuroshiroReady(): Promise<void> {
    if (!this.kuroshiroReady) {
      this.kuroshiroReady = this.kuroshiro.init(new KuromojiAnalyzer());
    }

    await this.kuroshiroReady;
  }

  private applyFixes(text: string, settings: UserSettings): string {
    let result = text;

    if (settings.fixChineseNaiToNi) {
      result = result.replace(/\bnai\b/gi, (match) => {
        if (match === match.toUpperCase()) {
          return 'NI';
        }
        if (match[0] === match[0].toUpperCase()) {
          return 'Ni';
        }
        return 'ni';
      });
    }

    if (settings.customRomanizationFrom && settings.customRomanizationTo) {
      result = result.split(settings.customRomanizationFrom).join(settings.customRomanizationTo);
    }

    return result;
  }

  private containsHan(text: string): boolean {
    return /\p{Script=Han}/u.test(text);
  }

  private containsJapanese(text: string): boolean {
    return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
  }

  private containsHangul(text: string): boolean {
    return /\p{Script=Hangul}/u.test(text);
  }
}
