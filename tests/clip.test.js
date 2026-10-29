import test from 'node:test';
import assert from 'node:assert/strict';
import { ReplayClip } from '../dist/clip.js';

function browser(t, options = {}) {
  const saved = new Map();
  const replace = (name, value) => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  const timers = new Map();
  let nextTimer = 1;
  let now = 0;
  const events = new Map();
  const environment = { canvases: [], images: [], recorders: [], tracks: [], timers };
  replace('performance', { now: () => now });
  replace('setTimeout', (callback, delay = 0) => {
    const id = nextTimer++;
    timers.set(id, { callback, due: now + delay });
    return id;
  });
  replace('clearTimeout', id => timers.delete(id));
  environment.tick = milliseconds => {
    const until = now + milliseconds;
    for (;;) {
      let chosen;
      for (const entry of timers) if (entry[1].due <= until && (!chosen || entry[1].due < chosen[1].due)) chosen = entry;
      if (!chosen) break;
      timers.delete(chosen[0]);
      now = chosen[1].due;
      chosen[1].callback();
    }
    now = until;
  };
  class Canvas {
    constructor() {
      this.width = 800;
      this.height = 560;
      const calls = [];
      this.calls = calls;
      this.context = new Proxy({}, {
        get(target, key) { return target[key] ?? ((...args) => calls.push([key, ...args])); },
        set(target, key, value) { target[key] = value; return true; },
      });
      environment.canvases.push(this);
    }
    getContext() { return this.context; }
    captureStream() {
      if (options.captureError) throw new Error('Canvas capture failed');
      const track = {
        stopped: 0, requested: 0, onended: null,
        stop() { this.stopped += 1; this.onended?.(); },
        requestFrame() { this.requested += 1; },
      };
      environment.tracks.push(track);
      return { getTracks: () => [track], getVideoTracks: () => [track] };
    }
  }
  class Image {
    naturalWidth = 1536;
    naturalHeight = 1024;
    constructor() { environment.images.push(this); }
    set src(value) {
      this.url = value;
      if (options.image === 'pending') return;
      queueMicrotask(() => options.image === 'failure' ? this.onerror?.() : this.onload?.());
    }
    removeAttribute() { this.removed = true; }
  }
  class Recorder {
    static isTypeSupported(type) { return (options.types || ['video/webm;codecs=vp8']).includes(type); }
    constructor(stream, config) {
      this.stream = stream;
      this.mimeType = config.mimeType;
      this.state = 'inactive';
      this.startCount = 0;
      this.stopCount = 0;
      environment.recorders.push(this);
    }
    start() {
      if (options.startError) throw new Error('Encoder cannot start');
      this.startCount += 1;
      this.state = 'recording';
      this.hadRealFrameAtStart = environment.canvases[0].calls.some(call => call[0] === 'drawImage' && call[1] === environment.source);
    }
    stop() {
      this.stopCount += 1;
      this.state = 'inactive';
      if (options.finish === 'never') return;
      queueMicrotask(() => {
        const data = new Blob(options.finish === 'empty' ? [] : [options.payload || 'actual-encoded-frame'], { type: this.mimeType });
        this.ondataavailable?.({ data });
        this.onstop?.();
      });
    }
  }
  const document = {
    hidden: false,
    createElement: () => new Canvas(),
    addEventListener: (type, listener) => events.set(type, listener),
    removeEventListener: (type, listener) => { if (events.get(type) === listener) events.delete(type); },
  };
  replace('HTMLCanvasElement', Canvas);
  replace('Image', Image);
  replace('MediaRecorder', options.unsupported ? undefined : Recorder);
  replace('document', document);
  environment.source = { width: 800, height: 560 };
  environment.hide = () => { document.hidden = true; events.get('visibilitychange')?.(); };
  environment.events = events;
  t.after(() => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return environment;
}

function state() {
  return { time: 22.8, duration: 30, score: 73, phase: 'playing', mode: 'boss', segment: 1,
    boss: { stage: 1, hp: 2, totalStages: 3 }, player: { hp: 2 } };
}

const settle = () => new Promise(resolve => setImmediate(resolve));

function callbacks() {
  const completed = [];
  const errors = [];
  return { completed, errors, onComplete: (...value) => completed.push(value), onError: error => errors.push(error) };
}

test('unsupported recording fails cleanly without allocating a capture stream', async t => {
  const env = browser(t, { unsupported: true });
  const clip = new ReplayClip();
  const result = callbacks();
  assert.equal(ReplayClip.isSupported(), false);
  assert.equal(await clip.start(result), false);
  assert.equal(result.errors.length, 1);
  assert.equal(env.tracks.length, 0);
  assert.equal(clip.active, false);
  assert.equal(env.timers.size, 0);
});

test('background load failure reports an error and resolves start', async t => {
  const env = browser(t, { image: 'failure' });
  const clip = new ReplayClip();
  const result = callbacks();
  assert.equal(await clip.start(result), false);
  assert.match(result.errors[0].message, /background/);
  assert.equal(env.images[0].onload, null);
  assert.equal(env.images[0].onerror, null);
  assert.equal(env.tracks.length, 0);
  assert.equal(env.timers.size, 0);
});

test('first draw starts recording only after real imagery and exact game metadata are composed', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const game = state();
  const before = JSON.stringify(game);
  assert.equal(await clip.start({ siteLabel: 'http://localhost:3000' }), true);
  assert.equal(clip.active, true);
  assert.equal(clip.isRecording, false);
  assert.equal(env.recorders[0].startCount, 0);
  assert.equal(env.canvases[0].width, 720);
  assert.equal(env.canvases[0].height, 960);
  assert.equal(clip.draw(env.source, game, 0), true);
  assert.equal(clip.isRecording, true);
  assert.equal(env.recorders[0].hadRealFrameAtStart, true);
  assert.ok(env.tracks[0].requested > 0);
  const text = env.canvases[0].calls.filter(call => call[0] === 'fillText').map(call => call[1]);
  for (const expected of ['REAL REPLAY', 'GAME TIME 22.8s', '73', '7.2s', 'BOSS 2/3 · HP 2', 'LIVES 2']) assert.ok(text.includes(expected), expected);
  assert.ok(!text.some(value => String(value).includes('localhost')));
  assert.equal(JSON.stringify(game), before);
  clip.cancel();
});

for (const language of ['en', 'zh']) {
  test(`${language} scripted demos are clearly labeled and never claim personal player footage`, async t => {
    const env = browser(t);
    const clip = new ReplayClip();
    await clip.start({ language, scriptedDemo: true });
    clip.draw(env.source, state());
    const calls = env.canvases[0].calls;
    const text = calls.filter(call => call[0] === 'fillText').map(call => call[1]);
    const expected = language === 'en'
      ? ['SCRIPTED DEMO · REPLAY', 'Watch these moves', 'become a boss.', 'SCRIPTED INPUTS · SILENT']
      : ['脚本示范 · REPLAY', '看这段走位，', '如何变成 BOSS。', '脚本输入示范 · 无音频'];
    for (const label of expected) assert.ok(text.includes(label), label);
    assert.ok(!text.includes('REAL REPLAY') && !text.includes('真实重放 · REPLAY'));
    assert.ok(!text.includes('My moves.') && !text.includes('我的走位，'));
    assert.ok(calls.some(call => call[0] === 'fillRect' && call[1] === 34 && call[2] === 146), 'Demo provenance has a visible top badge');
    assert.ok(text.includes('73') && text.includes('7.2s'), 'Demo labels must not replace factual game metadata');
    clip.cancel();
  });

  test(`${language} user replays keep their original first-person caption`, async t => {
    const env = browser(t);
    const clip = new ReplayClip();
    await clip.start({ language, scriptedDemo: false });
    clip.draw(env.source, state());
    const text = env.canvases[0].calls.filter(call => call[0] === 'fillText').map(call => call[1]);
    assert.ok(text.includes(language === 'en' ? 'REAL REPLAY' : '真实重放 · REPLAY'));
    assert.ok(text.includes(language === 'en' ? 'My moves.' : '我的走位，'));
    assert.ok(text.includes(language === 'en' ? 'Your next boss.' : '变成你的 BOSS。'));
    assert.ok(!text.some(label => String(label).includes('SCRIPTED') || String(label).includes('脚本')));
    clip.cancel();
  });
}

test('stop is idempotent and completes once after the final encoded data', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  clip.draw(env.source, state());
  assert.equal(clip.stop(), true);
  assert.equal(clip.stop(), false);
  assert.equal(result.completed.length, 0);
  env.tick(120);
  await settle();
  assert.equal(result.completed.length, 1);
  assert.ok(result.completed[0][0].size > 0);
  assert.equal(result.completed[0][1], 'webm');
  assert.equal(env.recorders[0].stopCount, 1);
  assert.equal(env.tracks[0].stopped, 1);
  assert.equal(clip.active, false);
  assert.equal(clip.stop(), false);
  assert.equal(env.timers.size, 0);
  assert.equal(result.errors.length, 0);
});

test('cancel releases tracks, callbacks, chunks, timers and ignores delayed encoder events', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  clip.draw(env.source, state());
  const session = clip._session;
  const recorder = env.recorders[0];
  const staleData = recorder.ondataavailable;
  const staleStop = recorder.onstop;
  recorder.ondataavailable({ data: new Blob(['first chunk']) });
  assert.equal(session.chunks.length, 1);
  assert.equal(clip.cancel(), true);
  staleData({ data: new Blob(['late chunk']) });
  staleStop();
  await settle();
  assert.equal(env.tracks[0].stopped, 1);
  assert.equal(recorder.ondataavailable, null);
  assert.equal(recorder.onerror, null);
  assert.equal(recorder.onstop, null);
  assert.equal(session.chunks.length, 0);
  assert.equal(session.canvas, null);
  assert.equal(env.events.size, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(result.completed.length, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(clip.cancel(), false);
});

test('a second start is rejected without interrupting the active export', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const original = callbacks();
  const reentry = callbacks();
  await clip.start(original);
  assert.equal(await clip.start(reentry), false);
  assert.equal(reentry.errors.length, 1);
  assert.equal(original.errors.length, 0);
  assert.equal(clip.active, true);
  assert.equal(env.recorders.length, 1);
  clip.cancel();
  assert.equal(await clip.start(original), true, 'The instance can be reused after cancellation');
  clip.cancel();
});

test('load timeout resolves pending start and leaves no late image handlers', async t => {
  const env = browser(t, { image: 'pending' });
  const clip = new ReplayClip();
  const result = callbacks();
  const start = clip.start(result);
  const lateLoad = env.images[0].onload;
  env.tick(8_000);
  assert.equal(await start, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /timed out/);
  lateLoad();
  assert.equal(env.recorders.length, 0);
  assert.equal(clip.active, false);
  assert.equal(env.timers.size, 0);
});

test('cancel during image preparation resolves start without completion or error', async t => {
  const env = browser(t, { image: 'pending' });
  const clip = new ReplayClip();
  const result = callbacks();
  const started = clip.start(result);
  clip.cancel();
  assert.equal(await started, false);
  assert.equal(result.errors.length, 0);
  assert.equal(result.completed.length, 0);
  assert.equal(env.timers.size, 0);
});

test('first-frame timeout releases the ready stream rather than exporting an empty title card', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  env.tick(8_000);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /No replay frame/);
  assert.equal(env.recorders[0].startCount, 0);
  assert.equal(env.tracks[0].stopped, 1);
  assert.equal(clip.active, false);
});

test('a supported MP4 encoder is selected when WebM is unavailable', async t => {
  const env = browser(t, { types: ['video/mp4'] });
  const clip = new ReplayClip();
  const result = callbacks();
  assert.equal(ReplayClip.isSupported(), true);
  await clip.start(result);
  clip.draw(env.source, state());
  clip.stop();
  env.tick(120);
  await settle();
  assert.equal(result.completed[0][1], 'mp4');
  assert.equal(result.completed[0][0].type, 'video/mp4');
});

test('recording automatically stops below 15 seconds without relying on further draw calls', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  clip.draw(env.source, state());
  env.tick(14_800);
  await settle();
  assert.equal(result.completed.length, 1);
  assert.equal(env.recorders[0].stopCount, 1);
  assert.equal(env.timers.size, 0);
});

test('encoder errors and oversized chunks fail without affecting game state', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  const game = state();
  const before = JSON.stringify(game);
  clip.draw(env.source, game);
  env.recorders[0].ondataavailable({ data: { size: 33 * 1024 * 1024 } });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /memory limit/);
  assert.equal(env.tracks[0].stopped, 1);
  assert.equal(JSON.stringify(game), before);
  await clip.start(result);
  env.recorders[1].onerror({ error: new Error('Hardware encoder failed') });
  assert.equal(result.errors.length, 2);
  assert.equal(env.tracks[1].stopped, 1);
  assert.equal(result.completed.length, 0);
});

test('encoder start failure releases its stream and reports once', async t => {
  const env = browser(t, { startError: true });
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  assert.equal(clip.draw(env.source, state()), false);
  assert.equal(result.errors.length, 1);
  assert.equal(clip.active, false);
  assert.equal(env.tracks[0].stopped, 1);
  assert.equal(env.timers.size, 0);
});

test('empty encoder output never reports a successful video', async t => {
  const env = browser(t, { finish: 'empty' });
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  clip.draw(env.source, state());
  clip.stop();
  env.tick(120);
  await settle();
  assert.equal(result.completed.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(env.tracks[0].stopped, 1);
});

test('encoder finalization timeout releases capture resources', async t => {
  const env = browser(t, { finish: 'never' });
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  clip.draw(env.source, state());
  clip.stop();
  env.tick(8_120);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /finish in time/);
  assert.equal(env.tracks[0].stopped, 1);
  assert.equal(clip.active, false);
  assert.equal(env.timers.size, 0);
});

test('hiding the page finishes an existing clip before background throttling can prolong it', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  clip.draw(env.source, state());
  env.hide();
  env.tick(120);
  await settle();
  assert.equal(result.completed.length, 1);
  assert.equal(env.events.size, 0);
});

test('WebM Duration uses the recorder stop time and excludes encoder finalization delay', async t => {
  // A minimal streaming container; codec payload is intentionally synthetic in
  // this recorder mock. The real captured file is validated separately.
  const payload = Buffer.from(
    '1a45dfa3874282847765626d' +
    '1853806701ffffffffffffff' +
    '1549a966872ad7b1830f4240' +
    '1654ae6b99ae97d781018381018685565f565038e088b08202d0ba8203c0' +
    '1f43b67501ffffffffffffffe78100a3858100008001', 'hex');
  const env = browser(t, { payload });
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  clip.draw(env.source, state());
  env.tick(1_234);
  clip.stop();
  env.tick(0);
  env.tick(5_000); // The recorder's queued stop event has not run yet.
  await settle();
  assert.equal(result.completed.length, 1);
  const bytes = new Uint8Array(await result.completed[0][0].arrayBuffer());
  assert.equal(bytes.length, payload.length + 11);
  assert.deepEqual([...bytes.subarray(36, 39)], [0x44, 0x89, 0x88]);
  assert.equal(new DataView(bytes.buffer).getFloat64(39), 1_234);
  assert.deepEqual(Buffer.from(bytes.subarray(47)), payload.subarray(36), 'Encoded frame bytes are unchanged');
});

test('cancelling during asynchronous WebM finalization suppresses completion and frees resources', async t => {
  const env = browser(t);
  const clip = new ReplayClip();
  const result = callbacks();
  await clip.start(result);
  clip.draw(env.source, state());
  clip.stop();
  env.tick(120);
  await Promise.resolve();
  assert.equal(clip._session.state, 'finalizing');
  assert.equal(clip.stop(), false);
  clip.cancel();
  await settle();
  assert.equal(result.completed.length, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(env.tracks[0].stopped, 1);
  assert.equal(env.timers.size, 0);
});
