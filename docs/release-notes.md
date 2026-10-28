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

The code is public on GitHub. Hosted preview remains owner-private until its audience change is authorized. Public posting and outreach drafts are prepared but have not been sent.
