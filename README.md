# AFTER YOU

**Your past. Your next weapon.**

Echo Rush is a 36-second arena game. Hold to aim, release to dash, then choose abilities that change what your recorded paths do: friendly replays, wall reflections, local explosions, or pruning old danger. Defeat your final echo to win.

[中文说明](README.zh-CN.md) · [GitHub](https://github.com/LancerLSY/after-you) · [Contribute a mod](CONTRIBUTING.md) · [MIT code](LICENSE)

**[Play in your browser](https://after-you-echo-arcade.lanceryou.chatgpt.site)**

No account or installation needed. You can also run it locally below.

Two experimental alternatives are now available locally: **Combination Garden**, a twelve-placement chain-building game, and **Odd Lot**, an absurd-object auction with optional real DeepSeek buyers. Run `npm run lab` and open [the lab](http://127.0.0.1:4178/lab/). See [prototype rules and delivery status](docs/lab-prototypes.md); these are not yet the public homepage.

![AFTER YOU gameplay: a glowing player, collected light, and echoes of past movements](docs/rush-gameplay.png)

## Echo Rush: build a different next move

The new default mode responds to the first playtest’s report that the game felt repetitive.

- Three hittable enemies are present immediately. Hold mouse/Space to aim; release to dash. Hits refund the dash cooldown.
- At 6 and 16 battle seconds, choose abilities that change geometry: **Relay**, **Ricochet**, **Burst**, and **Prune**. Relay repeats the actual reflected path you made, while Prune removes an old route and its hostile copies.
- Focus slow-motion is limited. The battle timer continues during focus and pauses for explicit choices.
- A six-hit final echo arrives at 26 seconds. Surviving without attacking cannot win.
- Challenge links share a seed and a self-reported score; friends can try a different build. Rush replays record both inputs and upgrade choices.

WASD/arrows move, holding mouse/Space aims, releasing fires, and Esc pauses. The old 60-second Classic and friend-made Boss modes remain at **[Classic / friend bosses](https://after-you-echo-arcade.lanceryou.chatgpt.site/?classic=1)**. Existing Boss links and version-1 challenge links still select those modes.

The [14-second scripted video](https://after-you-echo-arcade.lanceryou.chatgpt.site/assets/launch-demo.webm) demonstrates the earlier Classic/Boss rules, not Rush. Video export is available in those modes. The build and combat changes are software-verified; replay motivation still needs human testing.


## Watch, record, and take it offline

**In Classic / friend-made Boss modes, Watch a demo** plays a real, recomputed Boss replay using scripted controls. It is labeled as a scripted demo and never updates your personal best.

In those modes, **Save a clip** renders up to its last 14 seconds into a silent 720×960 vertical video. Preview the result, then choose **Download video**. WebM or MP4 support depends on the browser; the game does not upload the recording. Demo exports retain the scripted-demo label.

For a self-contained local copy:

```sh
npm run build:portable
```

Open `output/after-you.html` in a modern browser. Artwork, font and code are embedded; no local server or package installation is needed for the generated file. See [portable edition details](docs/portable.md) for browser permission limits. This local build does not publish a website or change hosted access.


## Classic and friend-made Boss modes

- **Your moves. Their boss.** Build a boss from your actual path, beat it yourself, then send the playable challenge in a compact link.
- **Collect, then break.** Chain lights up to ×5. Dash through your echoes for a separate bonus. Three lives; one 60-second run.
- **Same lights. Your turn.** Daily challenges share a UTC-date seed. Send a challenge link or save a score card. Free play generates a fresh seed each run.
- **Replay what happened.** Watch your finished run, export its input recording, or recompute it with the DOM-free engine.
- **Play your way.** Keyboard, mouse-drag, and touch controls; English and Chinese; optional synthesized sound; reduced-motion support and automatic pause when you switch tabs.

No account, API key, AI service, package installation, or build step is needed. The game has zero runtime dependencies.

## Run locally

With **Node.js 20+**, run these commands from the project directory:

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The local server binds only to `127.0.0.1`; `PORT=4174 npm start` selects another port. The browser files in `dist/` can also be served by a static host.

```sh
npm test
npm run check
```

The tests use Node's built-in runner and cover simulation, collisions, scoring, replay validation, Boss encoding and combat, and daily seeds. `npm run check` checks JavaScript syntax, asset references, and credential-like strings. Automated balance probes are development diagnostics, not human playtests or evidence of retention.

## Turn your run into a boss

1. Play for at least **8 seconds**, collect **3 lights**, and travel **600 arena units**. The result screen then offers **Turn my run into a boss**.
2. Beat the boss made from your movements. The normal sharing button unlocks only after you win this self-test.
3. Send the Boss link. Your friend faces **three phases in order, 3 HP each**, with **30 seconds total** and three lives. Dash to land nine hits; each collected light cuts the remaining dash cooldown by **0.35 seconds**.
4. An eligible run against that boss can become the next player's boss, too.

The Boss uses the first `min(30 seconds, run length)` of actual movement, split into three paths. Each path has 41 samples on a 4-unit grid and stretches to a ten-second loop. Its **339-character code** lives in the URL's `#boss` fragment; no upload service is needed. This is a sampled, quantized challenge, while the separate input replay reproduces the original simulation.

The self-test is a client-side sharing rule, not tamper-proof certification. The checksum detects corruption, not cheating; neither it nor a replay proves human play.

## Controls and classic scoring

| Action | Desktop | Touch |
|---|---|---|
| Move | WASD / arrows, or hold and drag inside the arena | Drag inside the arena like a joystick |
| Dash | Space | DASH button |
| Pause | Esc or pause button | Pause button |

Collect lights within four seconds of each other to increase the multiplier from ×1 to ×5. Each light gives `10 × multiplier` points and fades eight seconds after spawning. Damage resets the chain.

Every ten seconds, a new echo repeats the previous ten seconds of your path. Ordinary contact costs one life; a dash makes you invulnerable and shatters echoes. Dash lasts 0.18 seconds and recharges in 2.4 seconds. A shattered echo returns after two seconds, with a visible warning.

Each echo gives `50 + 10 × min(recorded lights, 8)` points once per ten-second cycle, provided you collected at least one light while recording that echo. Breaking it again still clears the danger but gives no extra points that cycle. Finish all 60 seconds after collecting light to receive `150 + 50 × remaining lives` bonus points.

## Seeds and honest replays

The simulation runs at 60 fixed ticks per second. The seed fixes the light schedule; recorded inputs reproduce the run under the same game rules. Replay files store a seed, version, mode, any Boss configuration, bounded inputs, and an advisory result. `runReplay()` calculates the result from the inputs and ignores a forged score in that metadata.

After saving a replay, it can be checked from a Node ES module:

```js
import { readFile } from 'node:fs/promises';
import { runReplay } from './dist/engine.js';

const replay = await readFile('after-you-replay.json', 'utf8');
const game = runReplay(replay);
console.log({ score: game.score, phase: game.phase, seconds: game.time });
```

Personal bests and preferences stay in your browser's local storage. Challenge-link scores are explicitly **self-reported**. There is no global leaderboard or server-side score verification. Recomputing a replay verifies its simulated result, not that a human played it.

## Make a different loop

`dist/` contains the editable source, not a generated bundle:

| File | Responsibility |
|---|---|
| [`dist/engine.js`](dist/engine.js) | Rules, seeded simulation, collision detection, replay import/export |
| [`dist/boss-codec.js`](dist/boss-codec.js) | Path sampling, compact Boss links, and validation |
| [`dist/renderer.js`](dist/renderer.js) | Canvas rendering, sprites, trails, and effects |
| [`dist/app.js`](dist/app.js) | Input, UI, languages, audio, sharing, and local storage |
| [`dist/style.css`](dist/style.css) | Layout, visual styling, and responsive controls |
| [`tests/engine.test.js`](tests/engine.test.js) | Simulation and replay regression tests |
| [`tests/boss.test.js`](tests/boss.test.js) | Boss encoding, combat, and replay regression tests |

Try a longer dash, a stricter collection window, a different echo rhythm, or an accessible visual theme. Keep rule-changing mods clearly named and separate from the original challenge scores. See [CONTRIBUTING.md](CONTRIBUTING.md) for the replay and testing contract.

Code is licensed under [MIT](LICENSE). Generated artwork and its provenance are documented in [docs/assets-provenance.md](docs/assets-provenance.md).

Rush uses `dist/rush.js`: `exportRushReplay()` records both inputs and upgrade choices, and `runRushReplay()` recomputes them. Its replay kind is `rush`; Classic/Boss replay version 1 remains unchanged in `dist/engine.js`.
