# Contributing to AFTER YOU

Help make one minute worth playing again. Small, playable improvements are welcome: clearer controls, fairer collisions, stronger feedback, translations, accessible visuals, and well-labeled rule variants. File issues and pull requests in [LancerLSY/after-you](https://github.com/LancerLSY/after-you).

## Start with a working loop

Use Node.js 20+ and run from the project directory:

```sh
npm test
npm run check
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). No dependency installation or build step is required. `dist/` contains the editable browser source. The local server binds to loopback only; use `PORT=4174 npm start` if the default port is occupied.

Keep each change focused. For a bug report, include the seed, browser, input method, steps to reproduce, expected behavior, and what happened. Attach an exported replay when the issue concerns simulation or scoring; a short capture helps for rendering and controls.

## Preserve the simulation contract

- Keep the simulation in `dist/engine.js` independent of the DOM, rendering, network, and wall-clock time. Use the existing seeded generator for gameplay randomness.
- Advance gameplay with the fixed 60 Hz simulation. Render timing and visual effects must not change movement, score, collisions, or the light schedule.
- Visual playback must call `stepReplay()` once per recorded tick. Recorded vectors and dash edges are already simulation inputs; do not normalize them or detect their edges a second time. Pause and focus changes must call `clearInput()` to discard held and queued live controls without discarding accumulated time.
- A seed plus recorded inputs must reproduce the result under the same rules. Never trust the score stored in a replay or challenge URL.
- Preserve replay size, duration, and input validation. Treat imported JSON and URL parameters as untrusted data.
- Rule changes can invalidate older replays. Document compatibility, update version handling and tests where needed, and keep modified scores separate. Do not claim that the current `v=1` challenge URL alone enforces compatibility: the app does not yet reject unsupported URL versions.

## Preserve the Boss challenge contract

`dist/boss-codec.js` derives three paths from the first `min(30 seconds, run length)` of recorded movement. Creation requires at least eight seconds, three collected lights, and 600 arena units traveled. Each path has 41 samples quantized to a 4-unit grid and plays over ten seconds. The canonical code is 339 characters, carried in `#boss`.

Keep strict length, alphabet, version, coordinate, speed, identity, and checksum checks for imported Boss data. The checksum detects corruption, not malicious authorship. The current combat contract is three sequential stages of 3 HP, a 30-second total limit, three player lives, and a 0.35-second reduction in remaining dash cooldown per collected light.

The UI requires creators to beat their newly generated boss before sharing. Preserve that flow and test failure, retry, success, and subsequent sharing. It is a local product rule, not a security boundary or proof of human play. Eligible Boss-mode runs must retain enough actual history to generate the next challenge, including wins before 30 seconds. Never substitute a random route and present it as the player's movement.

For a simulation bug, add a regression test that fails before the fix and exercises the actual behavior. Useful cases include a high-speed crossing, a loop boundary, a dash press between ticks, or a replay that previously diverged. Visual and wording changes need proportionate browser checks rather than tests that merely copy the implementation.

## Make mods easy to understand

The exported `RULES` object is a useful starting point for dash tuning, movement speed, collection windows, and echo timing. Check related assumptions in the app, codec, and tests before changing it: the current modes use 60-second classic runs, 30-second Boss fights, and 60 Hz simulation. Editing one number does not guarantee a complete mod.

Name a variant clearly, explain its one main change, and provide a seed plus a short recording that demonstrates it. Good experiments include a shorter dash cooldown, a slower practice mode, or a visual theme that improves contrast. Keep a mod's results distinct from the original daily challenge. A mod loader is not currently implemented.

## Check the whole interaction

Run `npm test` and `npm run check`, then play through the affected flow. The suite uses Node’s built-in runner. For input or UI changes, check keyboard and touch, pause/resume, switching tabs, restarting, and both languages. For result-page changes, check replay playback, replay export, challenge-link copying, score-card download, and Boss creation/self-test/sharing. Check reduced-motion mode and muted audio when changing feedback. Automated balance probes exercise scripted strategies; report them separately from human playtests and never present them as retention evidence.

`npm run check` uses `scripts/check.mjs` for JavaScript syntax, asset references, required artwork/font files, and a credential-pattern scan. Keep these checks passing alongside the test suite.

There is no configured TypeScript compiler or third-party lint stack. Avoid adding dependencies without a concrete need and discussion. A pull request should explain the player-visible change, why it helps, what was checked, and any known limitations. Include before/after screenshots for layout or rendering changes. Keep both READMEs and the in-game help accurate when behavior changes.

## Assets, privacy, and attribution

Code contributions are provided under the project's [MIT license](LICENSE). For artwork, fonts, or audio, include the source, author or generation method, reuse terms, and edits in [docs/assets-provenance.md](docs/assets-provenance.md). Do not submit copied proprietary game assets or credentials. Existing generated artwork must remain identified as generated.

The game currently stores personal bests and preferences locally, with user-triggered sharing. Discuss analytics, accounts, or network services before introducing them. Describe actual verification: a replayed score is not proof of human play, and a self-reported challenge is not a verified leaderboard entry.

## Commit messages

Lead with why the change was needed, then add useful Git trailers. For example:

```text
Keep fast dashes from skipping an echo

Check relative motion throughout the simulation tick so a crossing is
detected even when neither frame endpoint overlaps the echo.

Confidence: high
Scope-risk: narrow
Tested: Reproduction case and full engine suite
Not-tested: Physical touch-device input
```

Use `Constraint:`, `Rejected:`, or `Directive:` when the decision needs context that the diff cannot show.

## Demo and media provenance

The built-in demo is generated by `npm run demo:refresh` from ordinary simulation inputs and then replay-verified. Keep its scripted-demo label in the UI, video and score-card exports; do not merge its results into personal records. Video export must offer a preview and explicit download instead of claiming a file was saved from an unconfirmed programmatic click.

## Rush rules and route compatibility

`dist/rush.js` is the independent 36-second ruleset. `dist/rush-ui.js` maps pointer/keyboard releases and presents the two upgrade decisions. `app.js` selects Rush by default, while `?classic=1`, version-1 seed links and `#boss` select the archived Classic/Boss UI. Keep fragment routing outside the mode branch.

A shot uses the pointer position at release, not its position at the next render frame. A blur or choice clears held inputs; key-repeat events must not create a new press after that reset. On narrow screens, the visual world rotates 90 degrees and pointer/keyboard input uses the inverse mapping. The logic world, seeds and replays stay unchanged.

Rush replays include inputs plus `{tick,id}` upgrade choices. Apply a choice at its exact stopped tick before advancing the next input. Each dash and each Relay attack deduplicates target hits; explosions are single-level. Prune must preserve the final enemy and immutable snapshots used by active friendly replays.
