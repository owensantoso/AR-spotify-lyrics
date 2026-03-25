# Deprecated Spec

The active docs now live under [`docs/README.md`](/Users/macintoso/Documents/VSCode/mentra-g1-app/docs/README.md).

This file is retained only as a compatibility pointer.

## Goal

Show the currently playing Spotify song and synced lyric lines on Even Realities G1 glasses through a minimal MentraOS app.

This app is optimized for fast personal use, not for production quality or multi-user support.

## Current Behavior

- The app runs as a MentraOS cloud app from [`src/index.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/index.ts).
- On Mentra session connect, it starts polling Spotify for the current track.
- It fetches synced lyrics for the track.
- It displays a 4-line view on the glasses:
  1. `Song - Artist`
  2. `> current romanized line` if a supported romanization mode is enabled for the current script, otherwise `> current lyric line`
  3. `> current romanized overflow` if needed, otherwise `> current original lyric line` when romanized, otherwise continuation of the current lyric or the next lyric
  4. romanized next line if romanized, otherwise the next relevant lyric line
- Lyric timing is shown slightly early to improve readability.
- If no synced lyrics are found, the app falls back to showing only `Song - Artist`.
- If nothing is currently playing, the app shows `Start Spotify playback`.
- If Spotify is not authorized, the app shows `Spotify not authed` and `Open /spotify/login`.

## Current Architecture

### Entrypoint

- Main app file: [`src/index.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/index.ts)

### Main Flow

1. Mentra starts the app session.
2. `onSession(...)` begins a polling loop.
3. The app reads the current Spotify track and progress.
4. The app looks up synced lyrics.
5. The app chooses the lyric line based on Spotify `progress_ms` plus a user-configurable lyric timing offset.
6. The app sends a text wall layout to the G1 main view.

### Spotify

- Spotify auth is handled through simple Express routes:
  - `/spotify/login`
  - `/spotify/callback`
  - `/spotify/status`
- A simple in-app iPhone settings page exists at `/webview`
- Settings are saved in memory per user
- Supported toggles:
  - Chinese pinyin
  - Japanese romanization
  - Korean romanization
  - lyric timing offset from `-2000ms` to `+2000ms`
- Tokens are stored in memory only.
- This is a single-user personal-project setup.

### Lyrics Providers

Primary:
- LRCLIB

Fallback:
- LRCLIB search with looser matching
- NetEase unofficial fallback

### Local SDK Patch

The installed Mentra SDK was patched locally in:

- [`node_modules/@mentra/sdk/dist/app/session/index.js`](/Users/macintoso/Documents/VSCode/mentra-g1-app/node_modules/@mentra/sdk/dist/app/session/index.js)

Reason:
- The G1 was sending `device_state_update`
- The SDK treated unknown message types as fatal
- The local patch ignores `device_state_update` so the session stays alive

This patch is fragile and can be overwritten by dependency reinstall/update.

## Environment Variables

Expected in [`.env`](/Users/macintoso/Documents/VSCode/mentra-g1-app/.env):

```env
PORT=3000
PACKAGE_NAME=...
MENTRAOS_API_KEY=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=https://YOUR-NGROK-URL.ngrok-free.dev/spotify/callback
```

Reference template:
- [`.env.example`](/Users/macintoso/Documents/VSCode/mentra-g1-app/.env.example)

## Operational Notes

- The app is expected to run with `bun run dev`.
- ngrok is used so MentraOS and Spotify OAuth can reach the local server.
- Spotify callback URI must exactly match `SPOTIFY_REDIRECT_URI`.
- If the app loses the screen and weather/time reappears, that is likely related to Mentra/G1 foreground or view ownership behavior, not only lyric logic.

## Known Limitations

- Single-user only
- Spotify tokens are not persisted across restarts
- Webview settings are not persisted across restarts
- Lyrics depend on third-party coverage and metadata matching
- Some songs will have no synced lyrics
- NetEase fallback is unofficial and may fail or return `403`
- Display behavior is constrained by MentraOS/G1 view ownership
- No tests
- No persistence layer
- No web UI beyond the minimal auth/status routes

## Explicitly Out Of Scope For Now

- Guitar chords
- Chord-to-lyric alignment
- AI-assisted lyric/chord synchronization
- Multi-user auth/session management
- Persistent token storage
- Production hardening
- Refactoring into multiple modules
- Rich UI or settings screens
- Full documentation site

## What Has Been Done

- Confirmed Mentra app session startup on G1
- Added simple static text display to verify end-to-end rendering
- Diagnosed API key/package-name mismatch during initial setup
- Added Spotify OAuth flow
- Added Spotify current-track polling
- Added synced lyric lookup
- Added fallback behavior when lyrics are missing
- Added smarter LRCLIB matching
- Added a NetEase fallback attempt
- Reduced repeated provider hammering by caching no-lyrics results per track
- Added user-adjustable lyric timing offset in the iPhone settings page
- Tuned on-glasses layout for title plus lyric context
- Added a minimal `/webview` settings page for the Mentra iPhone app
- Added a per-user pinyin toggle for Chinese lyric lines
- Added per-user Japanese and Korean romanization toggles
- Patched the local SDK to ignore `device_state_update`

## Decision Rules For Future Changes

- Prefer the fastest working path over architectural polish.
- Keep changes small and easy to inspect.
- Prefer editing existing files over creating extra structure.
- Avoid adding features unless they directly improve the current Spotify lyrics experience.
- If a lyric provider fails for a track, avoid repeatedly retrying it during the same song.
- If a future change requires reliability across restarts, token persistence is the first thing to add.
