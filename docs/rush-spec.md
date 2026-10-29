# Echo Rush — response to the first player's feedback

The player said they did not want another round because the process was monotonous and lacked surprise/variation. This is one person's evidence, not a measured retention rate. v0.3 changes the battle loop; v0.2 remains available as Classic/Boss modes.

## Concrete loop

A 36-second battle with three lives. Start with three visible, hittable echoes. Hold pointer/Space to aim with limited focus slow-motion; release to dash. Movement keys remain available. A successful dash refunds its cooldown; a miss costs about 0.8 seconds. Each dash leaves a recorded trace that becomes a hostile echo after a visible warning. New hostile waves reuse actual recorded traces. The player must defeat a six-hit final echo that appears at battle second 26; surviving without attacking does not win.

At 6 and 16 battle seconds, combat pauses for a three-option ability choice. The first choice offers Relay, Ricochet and Burst. The second offers the two remaining options plus Prune. These alter geometry and the use of history:

- Relay: a friendly afterimage repeats each recorded dash after a short delay, attacking along that exact path.
- Ricochet: dashes reflect at arena walls, with the reflected path recorded for subsequent echoes and Relay.
- Burst: destroying an echo detonates a local pulse; positioning several echoes together becomes valuable.
- Prune: landing consumes the oldest stored trace and its hostile echo, trading future route reuse for space.

No numerical-only upgrade cards. Focus has a bounded reservoir so holding aim cannot indefinitely neutralize danger. The battle clock continues during focus and stops for explicit choices/pause.

## Compatibility and scope

Independent `rush.js` simulation and replay format. Do not alter classic/Boss simulation or their existing replay format. Canvas world remains 800×560. Keep original art, languages, keyboard/touch, pause, restart and local scores. New mode is the default except when an existing challenge URL explicitly selects another mode.

## Acceptance evidence

- Hittable enemies exist at start; the first shot can cause a shatter.
- Two choices happen within the run and genuinely change paths/effects.
- Relay uses the player's exact recorded path, including Ricochet geometry; replacing it with an arbitrary curve changes combat outcomes.
- A fixed movement-only route cannot win; victory requires defeating the final echo.
- Same seed, inputs and choices reproduce the complete result.
- Pause, fast tap/release, canceled touch, cooldown refunds and slow-motion limits work.
- Browser test on desktop and narrow viewport; all upgrade controls work.
- Ask the player again whether they want another round. Passing tests alone cannot prove this.
