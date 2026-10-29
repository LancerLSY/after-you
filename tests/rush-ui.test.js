import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';
import * as rush from '../dist/rush.js';
import * as classic from '../dist/engine.js';
import { encodeBoss, decodeBoss } from '../dist/boss-codec.js';
import { demoReplay, demoBossCode } from '../dist/demo-replay.js';

const rushSource = await readFile(new URL('../dist/rush-ui.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');

/** Execute the real UI body. Only imports and its export keyword are adapted to
 * a standard-library VM; no private game state or UI functions are injected. */
function withoutImports(source) { return source.replace(/^import[^\n]+;\s*$/gm, ''); }

function browser(href = 'https://game.test/?rush=1&v=2&seed=friend-regression&score=999', language = 'en', { portrait = false } = {}) {
  const nodes = new Map(), listeners = new Map(), animationFrames = [], storage = new Map();
  storage.set('after-you:language', language);
  const environment = { createdRushGames: [], createdClassicGames: [], renderers: [], reloads: 0, rushMounts: 0, now: 0 };
  let nextElement = 0, randomValue = 10;
  const dispatch = (id, type, properties = {}) => {
    const event = { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
    for (const listener of listeners.get(`${id}:${type}`) || []) listener(event);
    return event;
  };
  function node(id, tagName = 'div') {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set();
    const element = {
      id, tagName: tagName.toUpperCase(), textContent: '', innerHTML: '', hidden: false, disabled: false, open: false,
      dataset: {}, style: {}, children: [], attributes: new Map(), value: '', href: '',
      classList: {
        add(...values) { values.forEach((value) => classes.add(value)); },
        remove(...values) { values.forEach((value) => classes.delete(value)); },
        toggle(value, force) { if (force ?? !classes.has(value)) classes.add(value); else classes.delete(value); },
        contains(value) { return classes.has(value); },
      },
      setAttribute(name, value) { this.attributes.set(name, String(value)); },
      getAttribute(name) { return this.attributes.get(name) ?? null; },
      removeAttribute(name) { this.attributes.delete(name); },
      addEventListener(type, callback) { const key = `${id}:${type}`; listeners.set(key, [...(listeners.get(key) || []), callback]); },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; this.textContent = ''; },
      querySelector(selector) { return node(`${id}:${selector}`); },
      showModal() { this.open = true; },
      close() { if (this.open) { this.open = false; dispatch(id, 'close'); } },
      focus() { environment.focused = id; },
      scrollIntoView() {}, select() {}, pause() {},
      setPointerCapture(pointerId) { this.capturedPointer = pointerId; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 560 }; },
      click() { if (!this.disabled) return dispatch(id, 'click', { detail: 1 }); },
    };
    nodes.set(id, element);
    return element;
  }
  const document = {
    body: node('body', 'body'), documentElement: {}, hidden: false, title: '',
    getElementById: node,
    createElement: (tag) => node(`created-${nextElement++}`, tag),
    createTextNode: (text) => ({ textContent: text }),
    querySelectorAll: () => [],
    querySelector: (selector) => selector === 'dialog[open]' ? [...nodes.values()].find((element) => element.open) || null : node(`selector:${selector}`),
    addEventListener: (type, callback) => node('document').addEventListener(type, callback),
  };
  const window = { addEventListener: (type, callback) => node('window').addEventListener(type, callback) };
  let address = new URL(href);
  const location = {
    get href() { return address.href; }, set href(value) { address = new URL(value, address); },
    get hash() { return address.hash; }, set hash(value) { address.hash = value; },
    get protocol() { return address.protocol; }, get host() { return address.host; },
    reload() { environment.reloads += 1; },
  };
  class Renderer {
    constructor(canvas) { this.canvas = canvas; environment.renderers.push(this); }
    async load() { return true; }
    reset() {} onEvents() {}
    render(game) { this.game = game; environment.lastRenderedGame = game; }
  }
  class ReplayClip { static isSupported() { return false; } cancel() {} }
  const context = createContext({
    ...rush, ...classic, encodeBoss, decodeBoss, demoReplay, demoBossCode, Renderer, ReplayClip,
    createRush(seed) { const game = rush.createRush(seed); environment.createdRushGames.push(game); return game; },
    createGame(...args) { const game = classic.createGame(...args); environment.createdClassicGames.push(game); return game; },
    mountRush: async () => { environment.rushMounts += 1; },
    document, window, location, URL, URLSearchParams, Blob, console,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    crypto: { getRandomValues(array) { for (let index = 0; index < array.length; index += 1) array[index] = randomValue++; return array; } },
    performance: { now: () => environment.now },
    matchMedia: (query) => ({ matches: portrait && query === '(max-width:540px)' }),
    navigator: { clipboard: { async writeText(text) { environment.clipboard = text; } } },
    requestAnimationFrame: (callback) => { animationFrames.push(callback); return animationFrames.length; },
    setTimeout: () => 1, clearTimeout() {},
  });
  return Object.assign(environment, {
    context, document, location, node, dispatch,
    getGame: () => environment.createdRushGames.at(-1),
    click: (id) => node(id).click(),
    pointer: (type, { x = 560, y = 290, id = 1, ...rest } = {}) => dispatch('r-canvas', type, { pointerId: id, clientX: x, clientY: y, ...rest }),
    key: (type, code = 'Space', repeat = false) => dispatch('document', type, { code, repeat }),
    frame(milliseconds = 1000 / 60) {
      const callback = animationFrames.shift(); assert.ok(callback, 'the real UI scheduled its next animation frame');
      environment.now += milliseconds; callback(environment.now);
    },
    ticks(count) { for (let index = 0; index < count; index += 1) this.frame(); },
  });
}

async function mount(href, language, options) {
  const environment = browser(href, language, options);
  const source = withoutImports(rushSource).replace(/^export\s+(?=async function mountRush)/m, '');
  await new Script(`(async () => { 'use strict';\n${source}\nawait mountRush(); })()`, { filename: 'rush-ui.js' }).runInContext(environment.context);
  return environment;
}

async function route(href) {
  const environment = browser(href);
  await new Script(`(async () => { 'use strict';\n${withoutImports(appSource)}\n})()`, { filename: 'app.js' }).runInContext(environment.context);
  return environment;
}

function finishWithoutAttacking(environment) {
  for (let guard = 0; guard < 2300 && !['won', 'lost'].includes(environment.getGame().phase); guard += 1) {
    if (environment.getGame().phase === 'choosing') environment.key('keydown', 'Digit1');
    environment.frame();
  }
  assert.equal(environment.getGame().phase, 'lost');
  assert.equal(environment.node('r-result').open, true);
}

test('mouse release freezes its aim before pointer movement and a 120Hz frame boundary', async () => {
  const env = await mount(); env.click('r-play');
  env.pointer('pointerdown', { x: 560 }); env.pointer('pointerup', { x: 560 });
  env.pointer('pointermove', { x: 100 }); env.frame(1000 / 120);
  assert.equal(env.getGame().timeTicks, 0);
  env.pointer('pointermove', { x: 200 }); env.frame(1000 / 120);
  assert.equal(env.getGame().stats.dashes, 1);
  assert.ok(env.getGame().player.x > 400, 'the release aimed right, even though the pointer now aims left');
  assert.equal(env.getGame().inputs[0].aimX, 560);
  assert.equal(env.getGame().player.y, 290);
});

test('Space release freezes the same aiming coordinates as mouse release', async () => {
  const env = await mount(); env.click('r-play');
  env.pointer('pointermove', { x: 560, y: 290 });
  env.key('keydown'); env.key('keyup'); env.pointer('pointermove', { x: 100, y: 100 });
  env.frame();
  assert.equal(env.getGame().stats.dashes, 1);
  assert.equal(env.getGame().inputs[0].aimX, 560);
  assert.equal(env.getGame().inputs[0].aimY, 290);
  assert.ok(env.getGame().player.x > 400);
});

test('portrait play maps screen aiming and movement through the inverse 90-degree rotation', async () => {
  const env = await mount(undefined, undefined, { portrait: true });
  env.node('r-canvas').getBoundingClientRect = () => ({ left: 10, top: 20, width: 280, height: 400 });
  env.click('r-play');
  assert.equal(env.document.body.classList.contains('rush-playing'), true);
  // Screen u=.25, v=.75 must become world x=600, y=420.
  env.pointer('pointerdown', { x: 80, y: 320 }); env.pointer('pointerup', { x: 80, y: 320 }); env.frame();
  assert.equal(env.getGame().inputs[0].aimX, 600);
  assert.equal(env.getGame().inputs[0].aimY, 420);
  assert.ok(env.getGame().player.x > 400 && env.getGame().player.y > 290);

  const keyboard = await mount(undefined, undefined, { portrait: true }); keyboard.click('r-play');
  keyboard.key('keydown', 'KeyW'); keyboard.frame();
  assert.equal(keyboard.getGame().inputs[0].moveX, -1);
  assert.equal(Math.abs(keyboard.getGame().inputs[0].moveY), 0);
  assert.equal(keyboard.getGame().player.x, 397); assert.equal(keyboard.getGame().player.y, 290);
  keyboard.key('keyup', 'KeyW'); keyboard.key('keydown', 'KeyD'); keyboard.frame();
  assert.equal(keyboard.getGame().inputs[1].moveX, 0);
  assert.equal(keyboard.getGame().inputs[1].moveY, -1);
  assert.equal(keyboard.getGame().player.x, 397); assert.equal(keyboard.getGame().player.y, 287);
});

test('pointer cancellation never fires, but normal capture loss after release preserves the shot', async () => {
  for (const cancel of ['pointercancel', 'lostpointercapture']) {
    const env = await mount(); env.click('r-play');
    env.pointer('pointerdown'); env.pointer(cancel); env.pointer('pointerup'); env.frame();
    assert.equal(env.getGame().stats.dashes, 0, cancel);
  }
  const env = await mount(); env.click('r-play');
  env.pointer('pointerdown'); env.pointer('pointerup'); env.pointer('lostpointercapture'); env.frame();
  assert.equal(env.getGame().stats.dashes, 1);
});

test('blur clears queued release and stale Space repeats cannot fire after resume', async () => {
  const env = await mount(); env.click('r-play');
  env.pointer('pointerdown'); env.pointer('pointerup'); env.frame(1000 / 120);
  env.dispatch('window', 'blur');
  assert.equal(env.node('r-paused').open, true);
  env.click('r-resume'); env.key('keydown', 'Space', true); env.key('keyup'); env.frame(1000 / 120);
  assert.equal(env.getGame().stats.dashes, 0);
  assert.equal(env.getGame().aiming, false);
  env.key('keydown', 'Space', false); env.key('keyup'); env.frame();
  assert.equal(env.getGame().stats.dashes, 1, 'a new physical press/release still works');
});

test('choice pauses clear held Space and require a fresh press after selecting an upgrade', async () => {
  const env = await mount(); env.click('r-play'); env.key('keydown'); env.ticks(360);
  assert.equal(env.getGame().phase, 'choosing'); assert.equal(env.node('r-upgrades').open, true);
  const atChoice = env.getGame().timeTicks, world = env.getGame().worldTime;
  env.ticks(3); assert.equal(env.getGame().timeTicks, atChoice); assert.equal(env.getGame().worldTime, world);
  env.node('r-cards').children[0].click();
  assert.equal(env.getGame().phase, 'playing'); assert.equal(env.node('r-upgrades').open, false);
  assert.deepEqual(env.getGame().choices, [{ tick: 360, id: 'relay' }]);
  env.key('keydown', 'Space', true); env.key('keyup'); env.frame();
  assert.equal(env.getGame().stats.dashes, 0);
  env.key('keydown', 'Space', false); env.key('keyup'); env.frame();
  assert.equal(env.getGame().stats.dashes, 1);
});

test('same-seed retries keep the friend badge, fresh random runs hide it in both languages', async () => {
  const env = await mount();
  assert.equal(env.node('r-friend').hidden, false);
  assert.match(env.node('r-friend').textContent, /999/);
  env.click('r-play'); assert.equal(env.getGame().seed, 'friend-regression');
  finishWithoutAttacking(env);
  env.click('r-same'); assert.equal(env.getGame().seed, 'friend-regression'); assert.equal(env.node('r-friend').hidden, false);
  finishWithoutAttacking(env);
  env.click('r-again'); assert.notEqual(env.getGame().seed, 'friend-regression'); assert.equal(env.node('r-friend').hidden, true);
  env.click('r-language'); assert.equal(env.document.documentElement.lang, 'zh-CN'); assert.equal(env.node('r-friend').hidden, true);
});

test('the real UI applies replay choices before their next tick and reproduces the completed run', async () => {
  const env = await mount(); env.click('r-play'); finishWithoutAttacking(env);
  const original = env.getGame(), expected = rush.exportRushReplay(original);
  env.click('r-watch'); const playback = env.getGame(); assert.notEqual(playback, original);
  for (let guard = 0; guard < 2300 && !env.node('r-result').open; guard += 1) env.frame();
  assert.equal(env.node('r-result').open, true);
  assert.deepEqual(rush.exportRushReplay(playback), expected);
  assert.deepEqual(playback.history, original.history);
  assert.equal(env.node('r-replay-tag').hidden, true);
});

test('the real app entry selects Rush for new routes and initializes legacy rules for old links', async () => {
  const cases = [
    ['https://game.test/', 'rush'],
    ['https://game.test/?rush=1&v=2&seed=friend', 'rush'],
    ['https://game.test/?v=2&seed=friend', 'rush'],
    ['https://game.test/?classic=1', 'classic'],
    ['https://game.test/?seed=older&v=1', 'classic'],
    ['https://game.test/?seed=older', 'classic'],
    [`https://game.test/#boss=${demoBossCode}`, 'boss'],
  ];
  for (const [href, expected] of cases) {
    const env = await route(href);
    assert.equal(env.rushMounts, expected === 'rush' ? 1 : 0, href);
    if (expected === 'rush') {
      assert.equal(env.createdClassicGames.length, 0, 'the legacy branch must not attach its state or controls');
      assert.equal(env.renderers.length, 0);
    } else {
      assert.equal(env.createdClassicGames.at(-1).mode, expected, href);
      assert.equal(env.renderers.length, 1);
      if (expected === 'boss') assert.equal(env.createdClassicGames.at(-1).seed, demoReplay.seed);
    }
  }
});

test('Boss hash changes reload from Rush, legacy Classic and existing Boss routes', async () => {
  for (const href of ['https://game.test/', 'https://game.test/?classic=1']) {
    const env = await route(href);
    env.location.hash = '#credits'; env.dispatch('window', 'hashchange'); assert.equal(env.reloads, 0);
    env.location.hash = `#boss=${demoBossCode}`; env.dispatch('window', 'hashchange'); assert.equal(env.reloads, 1);
  }
  const existing = await route(`https://game.test/#boss=${demoBossCode}`);
  existing.location.hash = ''; existing.dispatch('window', 'hashchange');
  assert.equal(existing.reloads, 1, 'removing a Boss fragment must also reevaluate the entry route');
});
