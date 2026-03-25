# Design Decisions

## Why The App Is Still Simple

The app is deliberately biased toward fast iteration on a personal device rather than deep abstraction or long-term production concerns.

That means:
- local file persistence is acceptable
- a small number of focused files is preferred over over-engineering
- a local SDK patch is tolerated if it unblocks device behavior

## What “Maintainable” Means Here

For this project, maintainable means:
- each concern has a clear file owner
- app behavior can be changed without editing a 900+ line entry file
- future agents can find the real source of truth quickly
- layout changes do not require rewriting provider logic

It does not mean:
- introducing persistence before it is needed
- building a generic framework around one personal app
- abstracting every detail behind interfaces

## Chorus Skip Heuristic

`spotify skip to chorus` uses synced lyrics only. There is no external chorus or section API in the current app.

Current heuristic:
- Prefer repeated multi-line lyric windows.
- Score repeated 4-line, then 3-line, then 2-line sequences.
- Require at least 2 occurrences and at least 30 seconds of spread across the song.
- If no repeated block is found, fall back to repeated single lyric lines.
- When the command runs, jump to the next detected occurrence after the current playback position.
- The voice matcher is intentionally tolerant of common STT drift around `skip to chorus`, including `the`, `two`, `too`, and `course`.

Why this heuristic exists:
- repeated lyric blocks are the cheapest reliable chorus signal available from synced lyrics
- multi-line repeats are less noisy than a single repeated line
- the fallback still helps on songs where only one line clearly repeats

Known failure modes:
- repeated verses or refrains can be mistaken for a chorus
- songs with heavily varied chorus wording may not match
- instrumental lead-ins are ignored because the heuristic anchors to lyric timestamps

## Recommended Future Work

1. Add a small local test surface around display formatting and settings parsing.
2. Replace the local SDK patch once upstream SDK support exists.
3. Persist any additional state only if repeated workflow friction justifies it.
4. Add one more lyric provider only if coverage problems remain material after LRCLIB + NetEase.
