# Architecture

## Module Layout

- [`src/index.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/index.ts)
  Small entrypoint that starts the app server.

- [`src/app.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/app.ts)
  Main Mentra app orchestration. Wires routes, sessions, polling, display updates, touch handlers, and voice command handlers.

- [`src/config.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/config.ts)
  Environment-derived runtime config.

- [`src/types.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/types.ts)
  Shared domain types and default user settings.

- [`src/spotify-service.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/spotify-service.ts)
  Spotify OAuth and currently-playing API logic.

- [`src/lyrics-service.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/lyrics-service.ts)
  Lyrics provider lookup, matching, parsing, and per-track caching.

- [`src/romanization-service.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/romanization-service.ts)
  Chinese, Japanese, and Korean romanization plus lightweight correction rules.

- [`src/settings-store.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/settings-store.ts)
  User settings state plus local persistence.

- [`src/storage.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/storage.ts)
  Tiny JSON file persistence helpers for local state.

- [`src/display.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/display.ts)
  Pure formatting logic for the on-glasses lyric layout.

- [`src/webview.ts`](/Users/macintoso/Documents/VSCode/mentra-g1-app/src/webview.ts)
  HTML for the in-phone settings view.

## Design Decisions

- Services are stateful where the app already has in-memory state.
- Display formatting is kept pure so layout changes do not require touching Spotify or provider code.
- Spotify tokens and user settings are persisted locally because restart friction was high enough to justify it.
- Provider fallback order is LRCLIB first, then NetEase fallback.
- Romanization is a separate concern from lyric lookup and display formatting.
