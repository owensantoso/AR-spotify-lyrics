# Ground Truth

## Purpose

This project is a personal MentraOS app for Even Realities G1 glasses.

Its purpose is narrow:
- read the current Spotify track
- fetch synced lyrics when available
- render a compact lyric view on the glasses
- optionally romanize Chinese, Japanese, and Korean lyric lines

It is not intended to be a general platform, multi-user service, or production-ready app.

## Runtime Facts

- Entrypoint: [`src/index.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/index.ts)
- Main app class: [`src/app.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/app.ts)
- Startup command: `bun run dev`
- Local webview/settings route: `/webview`
- Spotify routes:
  - `/spotify/login`
  - `/spotify/callback`
  - `/spotify/status`

## Current User Experience

- The glasses show a text-wall lyric view.
- The first line is the current song title and primary artist.
- The remaining lines show the current lyric and nearby context.
- When romanization is enabled for the current script, romanized text is preferred.
- During long instrumental gaps, the app shows the title plus placeholder dots instead of going blank.
- Voice commands are available when transcription events are flowing:
  - `spotify play`
  - `spotify pause`
  - `spotify next song`
  - `spotify previous song`
  - `spotify skip x`
  - `spotify back x`
  - `spotify skip to chorus`
    - this command is intentionally tolerant of common transcription variants like `skip the chorus`, `skip two chorus`, and `skip the course`
  - `spotify chinese toggle`
  - `spotify korean toggle`
  - `spotify japanese toggle`
  - `spotify delay increase`
  - `spotify delay decrease`

## Current Technical Constraints

- Single-user oriented
- State is persisted locally in `.local/state/` for Spotify tokens and user settings
- Session-to-user mapping remains in memory only
- Lyrics depend on third-party metadata quality and provider availability
- NetEase fallback is unofficial
- A local SDK patch is still required for `device_state_update`
- Chorus detection is heuristic only and is inferred from repeated lyric patterns, not section metadata

## Out Of Scope

- chord rendering
- multi-user account handling
- persistent storage
- production deployment hardening
- generalized plugin architecture
