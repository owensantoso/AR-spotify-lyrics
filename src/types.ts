export type SpotifyTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: string[];
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
};

export type LyricLine = {
  timeMs: number;
  text: string;
};

export type TrackLyrics = {
  trackKey: string;
  lines: LyricLine[];
};

export type SearchCandidate = {
  title: string;
  artist: string;
};

export type ChorusMatch = {
  timeMs: number;
  windowSize: number;
  score: number;
  source: 'repeated-window' | 'repeated-line';
};

export type UserSettings = {
  showPinyin: boolean;
  showJapaneseRomanization: boolean;
  showKoreanRomanization: boolean;
  showOriginalBelowRomanization: boolean;
  lyricOffsetMs: number;
  fixChineseNaiToNi: boolean;
  customRomanizationFrom: string;
  customRomanizationTo: string;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  showPinyin: true,
  showJapaneseRomanization: false,
  showKoreanRomanization: true,
  showOriginalBelowRomanization: false,
  lyricOffsetMs: -500,
  fixChineseNaiToNi: true,
  customRomanizationFrom: '',
  customRomanizationTo: '',
};

export const INDENT = '\u00A0\u00A0';
