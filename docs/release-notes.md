# v0.1 — first playable build

Your movement becomes a three-phase boss that another player can open from a URL. Classic mode provides 60-second score runs; Boss lab provides an immediate starter fight. Own bosses must be defeated in the UI before sharing unlocks. This gate is gameplay flow, not anti-cheat or identity verification.

## Verified

- 35 Node tests; syntax, asset-reference and credential-pattern checks.
- IAB browser: desktop 1536×1024; narrow layout 390×844; English and Chinese.
- Start, keyboard movement, short-tap dash, cooldown, pause/resume, Boss import and timeout, challenge copy, replay playback and exported replay.
- Exported browser Boss replay independently recomputed to the same time, score, lives and mode.
- 20 scripted classic runs produced 20 bosses, all defeated by a bounded exact-position control program. These 40 simulations were replay-verified; they are not human playtests or retention measurements.
- Built-in ImageGen concept and final browser screenshot inspected together: typography, color, main layout, asset framing, HUD contrast, button geometry, instruction flow and narrow-screen layout. Functional additions and intentional visual deviations are recorded in the design spec.

## Known limits

No measured human retention or viral coefficient yet. Physical touch devices, Safari, and Firefox remain unverified; narrow-screen pointer testing passed. Scores are local and shared claims are self-reported. Boss codes are quantized challenges; input replays reproduce the original simulation. There is no server-side leaderboard or model-driven gameplay in this release. No API credential is required or included.

The code is public on GitHub. The owner explicitly approved public access on 2026-10-29 UTC; unauthenticated HTTP 200 and the actual public browser page were verified. Posting and outreach drafts are prepared but have not been sent.


# v0.2 — show the game and carry the result

- A labeled scripted demo shows a complete Boss fight, without updating personal records. Its recorded inputs are recomputed by the engine and tested.
- Replay clips render up to the final 14 seconds into a silent 720×960 video. A preview dialog and explicit download link replace unverified automatic-save claims. Scripted demos retain their provenance in clips and cards.
- A repository-specific, dependency-free packer generates a self-contained offline HTML file. Tests cover dependency ordering, embedded assets, script-string escaping and unsupported resources.
- Chinese and English launch copy and subtitle drafts now center on player-made Boss challenges.

Browser evidence: the video preview loaded at 720×960 with readyState 4 and no media error; an actual 2,944,938-byte WebM download was obtained. The original MediaRecorder WebM had indefinite duration metadata. A conservative metadata repair produced a 2,944,949-byte file that the browser reads as 14.0 seconds at 720×960 with readyState 4 and no media error. All encoded frame bytes remain identical to the original. Unsupported WebM layouts remain unchanged rather than being rewritten.

Offline limitation: the browser tool only allows HTTP(S) and rejected file://. The file was generated and its packaging/execution-fixture tests passed; double-click execution has not been claimed as browser-verified. No alternate browser mechanism was used to evade that restriction.

The v0.2 source passes 94 automated tests and the syntax/assets/credential check. Public hosting was verified in the browser for start, dash and pause without console errors. The packaged offline file remains unverified at file:// because the browser tool forbids that protocol.
