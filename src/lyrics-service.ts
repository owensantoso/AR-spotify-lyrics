import type { ChorusMatch, LyricLine, SearchCandidate, SpotifyTrack, TrackLyrics } from './types';

export class LyricsService {
  private readonly lyricsCache = new Map<string, TrackLyrics>();
  private readonly noLyricsCache = new Set<string>();
  private readonly chorusCache = new Map<string, ChorusMatch[]>();

  async getLyricsForTrack(track: SpotifyTrack): Promise<TrackLyrics | null> {
    const trackKey = `${track.id}:${track.durationMs}`;
    if (this.noLyricsCache.has(trackKey)) {
      return null;
    }

    const cached = this.lyricsCache.get(trackKey);
    if (cached) {
      console.log(`[Lyrics] Cache hit for ${track.name}`);
      return cached;
    }

    console.log(`[Lyrics] Looking up lyrics for ${track.name} - ${track.artists.join(', ')}`);

    let lines = await this.getLyricsFromLrclib(track);
    if (lines.length === 0) {
      lines = await this.getLyricsFromNetEase(track);
    }

    if (lines.length === 0) {
      console.log('[Lyrics] No synced lyrics found from any provider');
      this.noLyricsCache.add(trackKey);
      return null;
    }

    const lyrics = { trackKey, lines };
    this.lyricsCache.set(trackKey, lyrics);
    return lyrics;
  }

  pickCurrentIndex(lines: LyricLine[], progressMs: number): number {
    let currentIndex = -1;

    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].timeMs > progressMs) {
        break;
      }

      currentIndex = index;
    }

    return currentIndex;
  }

  findNextChorusTime(lyrics: TrackLyrics, progressMs: number): ChorusMatch | null {
    const matches = this.getChorusMatches(lyrics);
    const nextMatch = matches.find((match) => match.timeMs > progressMs + 1000) ?? null;
    console.log(
      `[Lyrics] Chorus lookup for ${lyrics.trackKey}: progress=${progressMs} candidates=${matches.length} next=${nextMatch ? `${nextMatch.timeMs}/${nextMatch.source}` : 'none'}`,
    );
    return nextMatch;
  }

  private async getLyricsFromLrclib(track: SpotifyTrack): Promise<LyricLine[]> {
    for (const candidate of this.buildSearchCandidates(track)) {
      const direct = await this.tryLrclibGet(candidate, track.durationMs);
      if (direct.length > 0) {
        console.log(`[Lyrics] LRCLIB direct match: ${candidate.title} - ${candidate.artist}`);
        return direct;
      }
    }

    for (const candidate of this.buildSearchCandidates(track)) {
      const searched = await this.tryLrclibSearch(candidate, track.durationMs);
      if (searched.length > 0) {
        console.log(`[Lyrics] LRCLIB search match: ${candidate.title} - ${candidate.artist}`);
        return searched;
      }
    }

    console.log('[Lyrics] LRCLIB exhausted');
    return [];
  }

  private async tryLrclibGet(candidate: SearchCandidate, durationMs: number): Promise<LyricLine[]> {
    const params = new URLSearchParams({
      track_name: candidate.title,
      artist_name: candidate.artist,
      duration: Math.round(durationMs / 1000).toString(),
    });

    const response = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`LRCLIB lookup failed with status ${response.status}`);
    }

    const data = await response.json() as { syncedLyrics?: string };
    return this.parseSyncedLyrics(data.syncedLyrics ?? '');
  }

  private async tryLrclibSearch(candidate: SearchCandidate, durationMs: number): Promise<LyricLine[]> {
    const params = new URLSearchParams({
      q: `${candidate.title} ${candidate.artist}`,
    });

    const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`LRCLIB search failed with status ${response.status}`);
    }

    const results = await response.json() as Array<{
      trackName?: string;
      artistName?: string;
      duration?: number;
      syncedLyrics?: string;
    }>;

    const normalizedTitle = this.normalizeForCompare(candidate.title);
    const normalizedArtist = this.normalizeForCompare(candidate.artist);
    const best = results.find((result) => {
      const resultTitle = this.normalizeForCompare(result.trackName ?? '');
      const resultArtist = this.normalizeForCompare(result.artistName ?? '');
      const durationDiff = Math.abs(((result.duration ?? 0) * 1000) - durationMs);

      return resultTitle.includes(normalizedTitle) &&
        resultArtist.includes(normalizedArtist) &&
        durationDiff <= 5000 &&
        Boolean(result.syncedLyrics);
    });

    if (!best?.syncedLyrics) {
      return [];
    }

    return this.parseSyncedLyrics(best.syncedLyrics);
  }

  private async getLyricsFromNetEase(track: SpotifyTrack): Promise<LyricLine[]> {
    for (const candidate of this.buildSearchCandidates(track)) {
      const query = `${candidate.title} ${candidate.artist}`;
      console.log(`[Lyrics] NetEase search fallback: ${query}`);

      const searchResponse = await fetch(
        `https://neteasecloudmusicapi-ten-wine.vercel.app/search?${new URLSearchParams({
          keywords: query,
          type: '1',
          limit: '10',
        }).toString()}`,
      ).catch((error) => {
        console.log(`[Lyrics] NetEase request failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });

      if (!searchResponse) {
        continue;
      }

      if (!searchResponse.ok) {
        console.log(`[Lyrics] NetEase search unavailable: ${searchResponse.status}`);
        return [];
      }

      const searchData = await searchResponse.json() as {
        result?: {
          songs?: Array<{
            id: number;
            name: string;
            artists?: Array<{ name: string }>;
            duration?: number;
            dt?: number;
          }>;
        };
      };

      const songs = searchData.result?.songs ?? [];
      const normalizedCandidateTitle = this.normalizeForCompare(candidate.title);
      const normalizedCandidateArtist = this.normalizeForCompare(candidate.artist);
      const match = songs.find((song) => {
        const songTitle = this.normalizeForCompare(song.name);
        const songArtist = this.normalizeForCompare(song.artists?.[0]?.name ?? '');
        const duration = song.dt ?? song.duration ?? 0;

        return songTitle.includes(normalizedCandidateTitle) &&
          (songArtist.includes(normalizedCandidateArtist) || normalizedCandidateArtist.includes(songArtist)) &&
          Math.abs(duration - track.durationMs) <= 7000;
      });

      if (!match) {
        continue;
      }

      const lyricResponse = await fetch(
        `https://neteasecloudmusicapi-ten-wine.vercel.app/lyric?${new URLSearchParams({
          id: String(match.id),
        }).toString()}`,
      );

      if (!lyricResponse.ok) {
        console.log(`[Lyrics] NetEase lyric unavailable: ${lyricResponse.status}`);
        return [];
      }

      const lyricData = await lyricResponse.json() as {
        lrc?: { lyric?: string };
      };

      const lines = this.parseSyncedLyrics(lyricData.lrc?.lyric ?? '');
      if (lines.length > 0) {
        console.log(`[Lyrics] NetEase match: ${match.name} - ${match.artists?.[0]?.name ?? ''}`);
        return lines;
      }
    }

    console.log('[Lyrics] NetEase exhausted');
    return [];
  }

  private buildSearchCandidates(track: SpotifyTrack): SearchCandidate[] {
    const titleCandidates = this.uniqueNonEmpty([
      track.name,
      this.cleanTrackTitle(track.name),
    ]);

    const artistCandidates = this.uniqueNonEmpty([
      track.artists.join(', '),
      track.artists[0] ?? '',
      this.cleanArtistName(track.artists[0] ?? ''),
    ]);

    return titleCandidates.flatMap((title) => artistCandidates.map((artist) => ({ title, artist })));
  }

  private cleanTrackTitle(title: string): string {
    return title
      .replace(/\s*-\s*remaster(ed)?\b.*$/i, '')
      .replace(/\s*\((feat|ft|from|live|remaster)[^)]+\)/gi, '')
      .replace(/\s*\[(feat|ft|from|live|remaster)[^\]]+\]/gi, '')
      .trim();
  }

  private cleanArtistName(artist: string): string {
    return artist
      .replace(/\s*,.*$/g, '')
      .replace(/\s+&.*$/g, '')
      .trim();
  }

  private normalizeForCompare(value: string): string {
    return value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private uniqueNonEmpty(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  }

  private getChorusMatches(lyrics: TrackLyrics): ChorusMatch[] {
    const cached = this.chorusCache.get(lyrics.trackKey);
    if (cached) {
      return cached;
    }

    const repeatedWindows = this.findRepeatedWindows(lyrics.lines);
    const repeatedLines = repeatedWindows.length > 0 ? [] : this.findRepeatedLines(lyrics.lines);
    const matches = [...repeatedWindows, ...repeatedLines].sort((a, b) => a.timeMs - b.timeMs);
    console.log(
      `[Lyrics] Chorus heuristic for ${lyrics.trackKey}: repeatedWindows=${repeatedWindows.length} repeatedLines=${repeatedLines.length}`,
    );
    this.chorusCache.set(lyrics.trackKey, matches);
    return matches;
  }

  private findRepeatedWindows(lines: LyricLine[]): ChorusMatch[] {
    const matchesByKey = new Map<string, Array<{ startIndex: number; totalChars: number }>>();

    for (const windowSize of [4, 3, 2]) {
      for (let startIndex = 0; startIndex <= lines.length - windowSize; startIndex += 1) {
        const window = lines.slice(startIndex, startIndex + windowSize);
        const normalized = window.map((line) => this.normalizeLyricText(line.text));
        const totalChars = normalized.reduce((sum, text) => sum + text.length, 0);

        if (normalized.some((text) => text.length < 4) || totalChars < (windowSize * 8)) {
          continue;
        }

        const key = `${windowSize}:${normalized.join('|')}`;
        const existing = matchesByKey.get(key) ?? [];

        if (existing.length > 0 && (startIndex - existing[existing.length - 1].startIndex) < windowSize) {
          continue;
        }

        existing.push({ startIndex, totalChars });
        matchesByKey.set(key, existing);
      }
    }

    const best = [...matchesByKey.entries()]
      .map(([key, occurrences]) => {
        const [windowSizeText] = key.split(':', 1);
        const windowSize = Number(windowSizeText);
        const score = occurrences.length * windowSize * occurrences[0].totalChars;
        const firstTimeMs = lines[occurrences[0].startIndex]?.timeMs ?? 0;
        const lastTimeMs = lines[occurrences[occurrences.length - 1].startIndex]?.timeMs ?? 0;

        return { occurrences, windowSize, score, spreadMs: lastTimeMs - firstTimeMs };
      })
      .filter((candidate) => candidate.occurrences.length >= 2 && candidate.spreadMs >= 30_000)
      .sort((left, right) => right.score - left.score)[0];

    if (!best) {
      console.log('[Lyrics] Chorus repeated-window heuristic found no candidate');
      return [];
    }

    console.log(
      `[Lyrics] Chorus repeated-window heuristic selected: occurrences=${best.occurrences.length} windowSize=${best.windowSize} score=${best.score}`,
    );

    return best.occurrences.map(({ startIndex }) => ({
      timeMs: lines[startIndex].timeMs,
      windowSize: best.windowSize,
      score: best.score,
      source: 'repeated-window' as const,
    }));
  }

  private findRepeatedLines(lines: LyricLine[]): ChorusMatch[] {
    const occurrencesByText = new Map<string, number[]>();

    for (let index = 0; index < lines.length; index += 1) {
      const normalized = this.normalizeLyricText(lines[index].text);
      if (normalized.length < 10) {
        continue;
      }

      const existing = occurrencesByText.get(normalized) ?? [];
      if (existing.length > 0 && (index - existing[existing.length - 1]) < 2) {
        continue;
      }

      existing.push(index);
      occurrencesByText.set(normalized, existing);
    }

    const best = [...occurrencesByText.entries()]
      .map(([text, occurrences]) => {
        const firstTimeMs = lines[occurrences[0]]?.timeMs ?? 0;
        const lastTimeMs = lines[occurrences[occurrences.length - 1]]?.timeMs ?? 0;
        const score = occurrences.length * text.length;
        return { occurrences, score, spreadMs: lastTimeMs - firstTimeMs };
      })
      .filter((candidate) => candidate.occurrences.length >= 2 && candidate.spreadMs >= 30_000)
      .sort((left, right) => right.score - left.score)[0];

    if (!best) {
      console.log('[Lyrics] Chorus repeated-line heuristic found no candidate');
      return [];
    }

    console.log(
      `[Lyrics] Chorus repeated-line heuristic selected: occurrences=${best.occurrences.length} score=${best.score}`,
    );

    return best.occurrences.map((index) => ({
      timeMs: lines[index].timeMs,
      windowSize: 1,
      score: best.score,
      source: 'repeated-line' as const,
    }));
  }

  private normalizeLyricText(text: string): string {
    return text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private parseSyncedLyrics(text: string): LyricLine[] {
    return text
      .split('\n')
      .flatMap((rawLine) => {
        const matches = [...rawLine.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g)];
        const lyricText = rawLine.replace(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g, '').trim();

        if (matches.length === 0 || !lyricText) {
          return [];
        }

        return matches.map((match) => {
          const minutes = Number(match[1]);
          const seconds = Number(match[2]);
          const fraction = match[3] ?? '0';
          const millis = fraction.length === 2 ? Number(fraction) * 10 : Number(fraction.padEnd(3, '0'));

          return {
            timeMs: (minutes * 60 * 1000) + (seconds * 1000) + millis,
            text: lyricText,
          };
        });
      })
      .sort((a, b) => a.timeMs - b.timeMs);
  }
}
