# AR Spotify Lyrics for Mentra G1

A personal MentraOS app that shows Spotify lyrics on Even Realities G1 glasses, with optional Chinese/Japanese/Korean romanization and live per-user settings.

Project docs live under [`docs/README.md`](/Users/macintoso/Documents/VSCode/mentra-g1-app/docs/README.md).

## Demo

Basic lyrics functionality:

https://github.com/user-attachments/assets/bc6e4780-f9d0-4d90-8a0c-5dedd3c63da8

Spotify control:

https://github.com/user-attachments/assets/ea35be6e-1f91-4ffa-a3c4-2ff29c485dcf



## What It Does

- Connects to Spotify and reads the currently playing track
- Fetches synced lyrics (LRCLIB first, NetEase fallback)
- Displays title + lyric context on G1
- Supports optional Chinese pinyin, Japanese romanization, and Korean romanization
- Exposes a `/webview` settings page in Mentra iOS app
- Supports voice playback commands:
  - `spotify play`
  - `spotify pause`
  - `spotify next song`
  - `spotify previous song`
  - `spotify skip x`
  - `spotify back x`
  - `spotify skip to chorus`
    - tolerant of common speech-to-text variants like `skip the chorus`, `skip two chorus`, and `skip the course`
- Supports voice settings commands:
  - `spotify chinese toggle`
  - `spotify korean toggle`
  - `spotify japanese toggle`
  - `spotify delay increase`
  - `spotify delay decrease`
- Persists Spotify tokens and settings locally to reduce restart friction

## Quick Start

1. Install dependencies:
```bash
bun install
```
2. Create your env file:
```bash
cp .env.example .env
```
3. Fill in required values in `.env`:
```env
PORT=3000
PACKAGE_NAME=com.yourname.yourapp
MENTRAOS_API_KEY=your_mentra_api_key
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://your-ngrok-url.ngrok-free.dev/spotify/callback
```
4. Run the app:
```bash
bun run dev
```
5. Expose it with ngrok:
```bash
ngrok http 3000
```
6. In Mentra developer console, set your app public URL to the ngrok HTTPS URL and ensure `PACKAGE_NAME` exactly matches.
7. Open Spotify auth:
```text
https://<your-ngrok-url>/spotify/login
```
8. Launch your app from Mentra iOS app / G1.


## Useful Routes

- `/spotify/login`
- `/spotify/callback`
- `/spotify/status`
- `/webview`

## Notes
Voice commands can sometimes be mis-transcribed as others, such as "spotify skip to chorus" being transcribed to "spotify skipped chorus". Future work needs to either use a more accurate transcribing model (ideal), or at least add more of the common mis-trasncriptions to be interpreted as the intended command.
