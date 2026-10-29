/** Real-time, silent replay exports. No simulation or replay data is changed. */
import { fixWebmDuration } from './webm-duration.js';

const CLIP_WIDTH = 720;
const CLIP_HEIGHT = 960;
const ARENA_Y = 205;
const ARENA_HEIGHT = 504;
const START_TIMEOUT = 8_000;
// Leave a small scheduling margin below the advertised 15-second limit.
const MAX_DURATION = 14_800;
const MIN_DURATION = 120;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_CHUNKS = 128;
const DEFAULT_SITE = 'after-you-echo-arcade.lanceryou.chatgpt.site';
const MIME_TYPES = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm', 'video/mp4;codecs=avc1.42E01E', 'video/mp4'];
const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace';

function supportedTypes() {
  try {
    return typeof globalThis.MediaRecorder?.isTypeSupported === 'function'
      ? MIME_TYPES.filter(type => globalThis.MediaRecorder.isTypeSupported(type)) : [];
  } catch { return []; }
}

function publicSiteLabel(value) {
  try {
    const input = typeof value === 'string' ? value.trim() : DEFAULT_SITE;
    const host = new URL(input.includes('://') ? input : `https://${input}`).hostname.toLowerCase();
    if (host.length > 80 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) return DEFAULT_SITE;
    return host;
  } catch { return DEFAULT_SITE; }
}

function notify(callback, ...args) {
  // A consumer callback must not interrupt the game's animation loop.
  try { Promise.resolve(callback?.(...args)).catch(() => {}); } catch { /* Consumer owns its UI errors. */ }
}

/**
 * start() resolves when ready; the first draw() starts the encoder.
 * Call draw() while active, after the game renderer. elapsed is optional seconds
 * since the first exported frame, not game.time. stop() finishes; cancel() drops.
 */
export class ReplayClip {
  constructor() {
    this._session = null;
  }

  static isSupported() {
    return typeof globalThis.document?.createElement === 'function'
      && typeof globalThis.HTMLCanvasElement?.prototype.captureStream === 'function'
      && typeof globalThis.MediaRecorder === 'function'
      && supportedTypes().length > 0;
  }

  get active() { return this._session !== null; }
  get isRecording() { return this._session?.state === 'recording'; }

  async start({ language = 'en', siteLabel = DEFAULT_SITE, scriptedDemo = false, onComplete, onError } = {}) {
    if (this.active) {
      notify(onError, new Error('A clip export is already active.'));
      return false;
    }
    const session = {
      state: 'loading', language: language === 'zh' ? 'zh' : 'en', siteLabel: publicSiteLabel(siteLabel), scriptedDemo: Boolean(scriptedDemo),
      onComplete, onError, canvas: null, ctx: null, image: null, recorder: null, stream: null,
      chunks: [], bytes: 0, frames: 0, startedAt: 0, recordedDurationMs: null, lastDrawAt: -Infinity,
      mimeType: '', resolveStart: null, loadTimer: null, firstFrameTimer: null,
      durationTimer: null, stopTimer: null, finishTimer: null, visibilityHandler: null,
    };
    this._session = session;
    return new Promise(resolve => {
      session.resolveStart = resolve;
      try {
        if (!ReplayClip.isSupported()) throw new Error('This browser does not support replay video recording.');
        if (document.hidden) throw new Error('Keep the game visible while exporting a replay.');
        const canvas = document.createElement('canvas');
        canvas.width = CLIP_WIDTH;
        canvas.height = CLIP_HEIGHT;
        session.canvas = canvas;
        session.ctx = canvas.getContext('2d', { alpha: false });
        if (!session.ctx) throw new Error('Cannot create the replay video canvas.');
        session.ctx.imageSmoothingEnabled = true;
        session.ctx.imageSmoothingQuality = 'high';
        const image = new Image();
        session.image = image;
        image.decoding = 'async';
        image.onload = () => {
          if (this._session !== session) return;
          try {
            if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('The replay background is empty.');
            session.stream = canvas.captureStream(30);
            const tracks = session.stream.getVideoTracks();
            if (!tracks.length) throw new Error('The browser did not create a video track.');
            let failure;
            for (const mimeType of supportedTypes()) {
              try {
                session.recorder = new MediaRecorder(session.stream, { mimeType, videoBitsPerSecond: 3_000_000 });
                session.mimeType = session.recorder.mimeType || mimeType;
                break;
              } catch (error) { failure = error; }
            }
            if (!session.recorder) throw failure || new Error('No supported video encoder is available.');
            this._bindRecorder(session);
            for (const track of session.stream.getTracks()) {
              track.onended = () => {
                if (this._session === session && session.state !== 'stopping') this._fail(session, new Error('Replay video capture was interrupted.'));
              };
            }
            session.visibilityHandler = () => { if (document.hidden && this._session === session) this.stop(); };
            document.addEventListener('visibilitychange', session.visibilityHandler);
            clearTimeout(session.loadTimer);
            session.loadTimer = null;
            session.state = 'ready';
            session.firstFrameTimer = setTimeout(() => this._fail(session, new Error('No replay frame arrived within eight seconds.')), START_TIMEOUT);
            session.resolveStart(true);
            session.resolveStart = null;
          } catch (error) { this._fail(session, error); }
        };
        image.onerror = () => this._fail(session, new Error('The replay background could not be loaded.'));
        session.loadTimer = setTimeout(() => this._fail(session, new Error('Replay video preparation timed out.')), START_TIMEOUT);
        // The single-file release embeds this exact resource reference.
        image.src = new URL('./assets/arena.png', import.meta.url).href;
      } catch (error) { this._fail(session, error); }
    });
  }

  _bindRecorder(session) {
    const recorder = session.recorder;
    recorder.ondataavailable = event => {
      if (this._session !== session || !event.data?.size) return;
      if (session.bytes + event.data.size > MAX_BYTES || session.chunks.length >= MAX_CHUNKS) {
        this._fail(session, new Error('Replay video exceeded the export memory limit.'));
        return;
      }
      session.bytes += event.data.size;
      session.chunks.push(event.data);
    };
    recorder.onerror = event => this._fail(session, event.error || new Error('The replay video encoder failed.'));
    recorder.onstop = async () => {
      if (this._session !== session) return;
      if (!session.frames || !session.bytes) {
        this._fail(session, new Error('The encoder did not produce a replay video frame.'));
        return;
      }
      try {
        session.state = 'finalizing';
        clearTimeout(session.durationTimer);
        clearTimeout(session.finishTimer);
        session.finishTimer = setTimeout(() => this._fail(session, new Error('Replay video finalization timed out.')), START_TIMEOUT);
        const mimeType = session.chunks[0].type || session.mimeType;
        const blob = new Blob(session.chunks, { type: mimeType });
        const extension = /mp4/i.test(mimeType) ? 'mp4' : 'webm';
        const durationMs = session.recordedDurationMs ?? performance.now() - session.startedAt;
        const completeBlob = extension === 'webm' ? await fixWebmDuration(blob, durationMs) : blob;
        if (this._session !== session) return;
        const callback = session.onComplete;
        this._release(session);
        notify(callback, completeBlob, extension);
      } catch (error) { this._fail(session, error); }
    };
  }

  draw(gameCanvas, game, elapsed) {
    const session = this._session;
    if (!session || (session.state !== 'ready' && session.state !== 'recording')) return false;
    try {
      if (!(gameCanvas?.width > 0 && gameCanvas?.height > 0)
        || !Number.isFinite(game?.time) || !Number.isFinite(game?.score)
        || !Number.isFinite(game?.duration) || !Number.isFinite(game?.player?.hp)) {
        throw new Error('A real replay frame and its game state are required.');
      }
      const now = performance.now();
      if (session.state === 'recording' && now - session.lastDrawAt < 1000 / 30
        && !(Number.isFinite(elapsed) && elapsed >= MAX_DURATION / 1000) && game.phase === 'playing') return false;
      this._compose(session, gameCanvas, game);
      session.frames += 1;
      session.lastDrawAt = now;
      if (session.state === 'ready') {
        clearTimeout(session.firstFrameTimer);
        session.firstFrameTimer = null;
        session.startedAt = now;
        session.state = 'recording';
        session.recorder.start(250);
        if (this._session !== session) return false;
        session.durationTimer = setTimeout(() => { if (this._session === session) this.stop(); }, MAX_DURATION);
      }
      session.stream.getVideoTracks()[0]?.requestFrame?.();
      if ((Number.isFinite(elapsed) && elapsed >= MAX_DURATION / 1000) || now - session.startedAt >= MAX_DURATION) this.stop();
      return true;
    } catch (error) { this._fail(session, error); return false; }
  }

  stop() {
    const session = this._session;
    if (!session || session.state === 'stopping' || session.state === 'finalizing') return false;
    if (!session.frames) {
      this._fail(session, new Error('No replay frame is available to export.'));
      return false;
    }
    session.state = 'stopping';
    clearTimeout(session.durationTimer);
    session.durationTimer = null;
    // Give even an immediately stopped replay a captured frame. The unchanged
    // final frame remains real footage; no new game state is invented here.
    const delay = Math.max(0, MIN_DURATION - (performance.now() - session.startedAt));
    session.stopTimer = setTimeout(() => {
      if (this._session !== session) return;
      session.finishTimer = setTimeout(() => this._fail(session, new Error('The video encoder did not finish in time.')), START_TIMEOUT);
      try {
        session.stream.getVideoTracks()[0]?.requestFrame?.();
        if (session.recorder.state === 'inactive') this._fail(session, new Error('The video encoder stopped unexpectedly.'));
        else {
          session.recordedDurationMs = Math.max(0, performance.now() - session.startedAt);
          session.recorder.stop();
        }
      } catch (error) { this._fail(session, error); }
    }, delay);
    return true;
  }

  cancel() {
    if (!this._session) return false;
    this._release(this._session);
    return true;
  }

  _fail(session, error) {
    if (this._session !== session) return;
    const callback = session.onError;
    this._release(session);
    notify(callback, error instanceof Error ? error : new Error(String(error)));
  }

  _release(session) {
    if (this._session !== session) return;
    this._session = null;
    for (const key of ['loadTimer', 'firstFrameTimer', 'durationTimer', 'stopTimer', 'finishTimer']) clearTimeout(session[key]);
    if (session.visibilityHandler) document.removeEventListener('visibilitychange', session.visibilityHandler);
    if (session.image) { session.image.onload = null; session.image.onerror = null; session.image.removeAttribute?.('src'); }
    if (session.recorder) {
      session.recorder.ondataavailable = null;
      session.recorder.onerror = null;
      session.recorder.onstop = null;
      if (session.recorder.state !== 'inactive') { try { session.recorder.stop(); } catch { /* Already stopped by the browser. */ } }
    }
    for (const track of session.stream?.getTracks() || []) {
      track.onended = null;
      try { track.stop(); } catch { /* A track may already have ended. */ }
    }
    session.resolveStart?.(false);
    session.resolveStart = null;
    session.chunks.length = 0;
    session.bytes = 0;
    session.onComplete = null;
    session.onError = null;
    if (session.canvas) { session.canvas.width = 1; session.canvas.height = 1; }
    session.canvas = null;
    session.ctx = null;
    session.image = null;
    session.recorder = null;
    session.stream = null;
  }

  _compose(session, gameCanvas, game) {
    const ctx = session.ctx;
    const zh = session.language === 'zh';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#080e15';
    ctx.fillRect(0, 0, CLIP_WIDTH, CLIP_HEIGHT);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f4f1db';
    ctx.font = `500 20px ${SANS}`;
    ctx.fillText('A F T E R  Y O U', 40, 57);
    ctx.strokeStyle = '#bca6ff';
    ctx.lineWidth = 1.5;
    for (const x of [637, 655]) { ctx.beginPath(); ctx.arc(x, 47, 14, 0, Math.PI * 2); ctx.stroke(); }
    ctx.font = `700 ${zh ? 39 : 43}px ${SANS}`;
    ctx.fillText(zh ? '过去的我，成了 BOSS。' : 'Your past fights back.', 40, 119, 640);
    if (session.scriptedDemo) {
      ctx.fillStyle = '#ffbd87';
      ctx.fillRect(34, 146, 254, 33);
      ctx.fillStyle = '#201a19';
      ctx.font = `700 16px ${MONO}`;
      ctx.fillText(zh ? '脚本示范 · REPLAY' : 'SCRIPTED DEMO · REPLAY', 43, 169);
    } else {
      ctx.fillStyle = '#bca6ff';
      ctx.font = `600 14px ${MONO}`;
      ctx.fillText(zh ? '真实重放 · REPLAY' : 'REAL REPLAY', 40, 170);
    }
    ctx.fillStyle = '#bca6ff';
    ctx.font = `600 14px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${zh ? '游戏时间' : 'GAME TIME'} ${game.time.toFixed(1)}s`, 680, 170);

    const image = session.image;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = CLIP_WIDTH / ARENA_HEIGHT;
    const sourceWidth = sourceRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth;
    const sourceHeight = sourceRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio;
    ctx.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2,
      sourceWidth, sourceHeight, 0, ARENA_Y, CLIP_WIDTH, ARENA_HEIGHT);
    ctx.drawImage(gameCanvas, 0, ARENA_Y, CLIP_WIDTH, ARENA_HEIGHT);
    ctx.fillStyle = '#080e15e8';
    ctx.fillRect(0, ARENA_Y, CLIP_WIDTH, 62);
    ctx.fillStyle = '#bcc1d4';
    ctx.font = `500 11px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(zh ? '分数' : 'SCORE', 25, ARENA_Y + 19);
    ctx.textAlign = 'right';
    ctx.fillText(zh ? '剩余时间' : 'TIME LEFT', 695, ARENA_Y + 19);
    ctx.fillStyle = '#c9ff85';
    ctx.font = `600 27px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(game.score), 25, ARENA_Y + 48);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.max(0, game.duration - game.time).toFixed(1)}s`, 695, ARENA_Y + 48);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4f1db';
    ctx.font = `600 14px ${MONO}`;
    const boss = game.mode === 'boss' && game.boss;
    ctx.fillText(boss ? `BOSS ${boss.stage + 1}/${boss.totalStages} · HP ${boss.hp}` : `${zh ? '回环' : 'LOOP'} ${game.segment + 1}`, 360, ARENA_Y + 24);
    ctx.fillStyle = '#c9ff85';
    ctx.fillText(`${zh ? '生命' : 'LIVES'} ${game.player.hp}`, 360, ARENA_Y + 47);
    ctx.strokeStyle = '#52637a';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, ARENA_Y + 0.5, CLIP_WIDTH - 1, ARENA_HEIGHT - 1);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#aab3c8';
    ctx.font = `500 13px ${MONO}`;
    const phase = game.phase === 'won' ? (zh ? '挑战成功' : 'WON') : game.phase === 'lost' ? (zh ? '挑战结束' : 'LOST') : (zh ? '挑战进行中' : 'IN PLAY');
    ctx.fillText(phase, 40, 739);
    ctx.textAlign = 'right';
    ctx.fillText(session.scriptedDemo ? (zh ? '脚本输入示范 · 无音频' : 'SCRIPTED INPUTS · SILENT') : (zh ? '录自真实游戏 · 无音频' : 'ACTUAL GAMEPLAY · SILENT'), 680, 739);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f4f1db';
    ctx.font = `700 ${zh ? 36 : 41}px ${SANS}`;
    ctx.fillText(session.scriptedDemo ? (zh ? '看这段走位，' : 'Watch these moves') : (zh ? '我的走位，' : 'My moves.'), 40, 801);
    ctx.fillStyle = '#c9ff85';
    ctx.fillText(session.scriptedDemo ? (zh ? '如何变成 BOSS。' : 'become a boss.') : (zh ? '变成你的 BOSS。' : 'Your next boss.'), 40, 849);
    ctx.strokeStyle = '#344154';
    ctx.beginPath();ctx.moveTo(40, 881);ctx.lineTo(680, 881);ctx.stroke();
    ctx.fillStyle = '#bca6ff';
    ctx.font = `500 19px ${MONO}`;
    ctx.fillText(session.siteLabel, 40, 921, 640);
  }
}
