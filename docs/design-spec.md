# AFTER YOU — visual and interaction contract

Concept: `concept.png`, generated with the built-in ImageGen tool, 1536×1024.

- Background #080e15; ink #f4f1db; mint #c9ff85; lilac #bca6ff; border #405066.
- Open two-column desktop: ~36% editorial introduction, ~64% actual interactive arena. At 1536px: 80px horizontal margins, header 76px, main begins 104px. Canvas logical world 800×560, aspect 10:7.
- Condensed display headings, lightly tracked sans body, monospace numeric HUD. Local system condensed faces with robust fallbacks; no runtime font service requirement.
- Header: double-circle mark, AFTER YOU, How to play, Sound off, GitHub. Main copy and CTA follow concept. Three numbered instructions under one separator, no card grid.
- Production arena and transparent wisp/light sprites generated separately with ImageGen. No gameplay/UI baked into images. Fine grid, particles and trails are functional canvas effects.
- Responsive: one column under 860px, compact heading and instructions; full-width arena, floating drag control area and dedicated dash button; keep logical world constant for fair seeds.

## Intentional functional additions and copy revisions

Research found direct predecessors for pure ghost dodging. The real mechanic is dash THROUGH echoes to shatter them for points. Update body to “Collect light. Leave an echo. Dash through your past.” and step 02 to “Break your echoes”. Never claim global first.

Add 3-life health indicator, dash cooldown, pause, daily/random selector, replay and challenge buttons on the end screen. These are required game states, absent from the static concept. Add Chinese/English language toggle; English is the visual reference, Chinese is available for the user. Add local best only, never fabricated global leaderboards. Hero CTA changes with play state. Responsive arena height and title scale may differ from concept to keep controls visible.

## Acceptance

Real keyboard/pointer/touch movement; edge-triggered dash; score, health, echoes, win/lose/restart; deterministic daily seed; URL challenge; local replay/export; accessible pause and reduced-motion; graceful storage/audio failures. Test gameplay model with Node and rendered flow via IAB. Verify desktop and narrow-screen layout, all images load, no console errors. Record concrete fidelity deviations before each revision.

## Shipped additions after novelty review

Player-made Boss mode uses the player’s own recorded movement to build three sequential phases. Boss lab offers an explicitly labeled starter. Three HP arcs and predicted paths are native canvas information. Footer and help change to the 30-second Boss rules. The same original generated sprites and environment are retained. External page foliage from the concept is confined to the arena to preserve a clear reading surface; headline uses locally hosted OFL Barlow Condensed. See README for actual values.
