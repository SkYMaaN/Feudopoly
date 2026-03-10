# AGENTS.md

## Purpose

This repository contains code and data related to a board-game style ruleset extracted from the source PDF `! Monopoly - die Spielinformationen.de.en.pdf`.

When modifying code, generating tests, or proposing refactors, use the game rules as a source of truth for gameplay behavior.

## Source of truth

Use rule sources in this priority order:

1. `docs/game-rules.md` — preferred, because it is plain text and easiest to parse reliably.
2. `! Monopoly - die Spielinformationen.de.en.pdf` — fallback source if the markdown file is missing or incomplete.

If the two sources disagree, prefer the version that preserves the event boundaries and dice outcomes correctly. Do not merge dice outcomes from neighboring events.

## Critical rule-parsing constraint

The source material contains OCR/translation noise. Be careful not to attach a dice result table to the wrong event.

Required behavior when interpreting rules:

* Keep each numbered event isolated.
* A `Roll again` block belongs only to the event immediately before it, unless a separate numbered event starts.
* Never move a dice outcome from one numbered event to another.
* Preserve exact dice ranges such as `1`, `1–2`, `1–3`, `1–4`, `2–4`, `3–4`, `4–6`, `5–6`.
* Preserve direct gameplay effects exactly: move forward/back, skip turns/rounds, go to field X, player elimination, pass dice, or conditional effects by player group.

## Coding guidance

When working with game logic:

* Prefer data-driven rules over hardcoded branching spread across many files.
* Keep event definitions separate from engine logic.
* Add tests for every numbered event.
* Add regression tests specifically for events whose dice outcomes are easy to mis-assign.
* If a rule is ambiguous because of OCR noise, leave a short code comment and preserve existing tested behavior unless explicitly asked to change it.

## Testing requirements

For any rule-engine change, verify at minimum:

* correct mapping of event number -> rule
* correct mapping of dice range -> outcome
* no leakage of outcomes between adjacent events
* correct handling of skip-turn effects
* correct handling of move-to-field effects
* correct handling of group effects (for example, all players, all women, all Muslims, selected player)
* correct handling of elimination outcomes

## Change policy

Do not silently rewrite gameplay semantics for readability. Preserve behavior first, then improve structure.

If you need to normalize wording, keep the rule effect unchanged and document the normalization in comments or commit notes.
