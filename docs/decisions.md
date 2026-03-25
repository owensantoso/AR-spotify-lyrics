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

## Recommended Future Work

1. Add a small local test surface around display formatting and settings parsing.
2. Replace the local SDK patch once upstream SDK support exists.
3. Persist any additional state only if repeated workflow friction justifies it.
4. Add one more lyric provider only if coverage problems remain material after LRCLIB + NetEase.
