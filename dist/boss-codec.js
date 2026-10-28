/** Compact player-made bosses. The checksum detects corruption, not cheating. */
const VERSION = 1;
const STAGES = 3;
const SAMPLES = 41;
const HEADER = [65, 89, 66, VERSION];
const PAYLOAD_LENGTH = HEADER.length + STAGES * SAMPLES * 2;
const PACKET_LENGTH = PAYLOAD_LENGTH + 4;
const MAX_CODE_LENGTH = 600;
const MAX_SAMPLE_DISTANCE = 800 / 4 + Math.SQRT2 * 4;

function checksum(bytes) {
  let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
}

function positionValid(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 24 && point.x <= 776 && point.y >= 64 && point.y <= 516;
}

function packetFromPaths(paths) {
  if (!Array.isArray(paths) || paths.length !== STAGES) throw new TypeError('A boss requires exactly three paths.');
  const bytes = new Uint8Array(PACKET_LENGTH);
  bytes.set(HEADER);
  let offset = HEADER.length;
  for (const path of paths) {
    if (!Array.isArray(path) || path.length !== SAMPLES) throw new TypeError('Each boss path requires 41 samples.');
    for (let index = 0; index < path.length; index += 1) {
      const point = path[index];
      if (!positionValid(point) || point.x % 4 !== 0 || point.y % 4 !== 0) throw new TypeError('Invalid boss coordinates.');
      if (index && Math.hypot(point.x - path[index - 1].x, point.y - path[index - 1].y) > MAX_SAMPLE_DISTANCE) {
        throw new RangeError('Boss path exceeds the speed limit.');
      }
      bytes[offset++] = point.x / 4;
      bytes[offset++] = point.y / 4;
    }
  }
  new DataView(bytes.buffer).setUint32(PAYLOAD_LENGTH, checksum(bytes.subarray(0, PAYLOAD_LENGTH)));
  return bytes;
}

function toCode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function configFromPaths(paths) {
  const bytes = packetFromPaths(paths);
  const id = new DataView(bytes.buffer).getUint32(PAYLOAD_LENGTH).toString(16).padStart(8, '0');
  return { version: VERSION, paths: paths.map((path) => path.map(({ x, y }) => ({ x, y }))), id, seed: `boss-${id}` };
}

/** Validate direct/replay configurations as strictly as URL-decoded challenges. */
export function validateBoss(boss) {
  if (!boss || boss.version !== VERSION) throw new TypeError('Unsupported boss version.');
  const canonical = configFromPaths(boss.paths);
  if ((boss.id !== undefined && boss.id !== canonical.id) || (boss.seed !== undefined && boss.seed !== canonical.seed)) {
    throw new TypeError('Boss identity does not match its paths.');
  }
  return canonical;
}

/** Sample the first min(30 s, run length) into three stretched 10-second paths. */
export function encodeBoss(game) {
  if (!game || !Number.isInteger(game.timeTicks) || game.timeTicks < 480
    || !Number.isFinite(game.stats?.lightsCollected) || game.stats.lightsCollected < 3
    || !Number.isFinite(game.stats?.distance) || game.stats.distance < 600
    || !Array.isArray(game.history) || game.history.length !== game.timeTicks + 1) return null;
  const lastFrame = Math.min(1800, game.timeTicks);
  const paths = [];
  for (let stage = 0; stage < STAGES; stage += 1) {
    const path = [];
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      const frame = lastFrame * (stage + sample / (SAMPLES - 1)) / STAGES;
      const index = Math.floor(frame);
      const from = game.history[index];
      const to = game.history[Math.min(index + 1, lastFrame)];
      if (!positionValid(from) || !positionValid(to)) return null;
      const fraction = frame - index;
      path.push({ x: Math.round((from.x + (to.x - from.x) * fraction) / 4) * 4,
        y: Math.round((from.y + (to.y - from.y) * fraction) / 4) * 4 });
    }
    paths.push(path);
  }
  try { return toCode(packetFromPaths(paths)); } catch { return null; }
}

/** Decode data only. Wrong lengths, alphabets, versions, bounds and speeds fail. */
export function decodeBoss(code) {
  if (typeof code !== 'string' || code.length > MAX_CODE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(code)) {
    throw new TypeError('Invalid boss code.');
  }
  let binary;
  try { binary = atob(code.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - code.length % 4) % 4)); }
  catch { throw new TypeError('Invalid boss encoding.'); }
  if (binary.length !== PACKET_LENGTH) throw new RangeError('Invalid boss packet length.');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (toCode(bytes) !== code) throw new TypeError('Non-canonical boss encoding.');
  if (!HEADER.every((byte, index) => bytes[index] === byte)) throw new TypeError('Unsupported boss version.');
  const expected = new DataView(bytes.buffer).getUint32(PAYLOAD_LENGTH);
  if (expected !== checksum(bytes.subarray(0, PAYLOAD_LENGTH))) throw new TypeError('Boss checksum mismatch.');
  let offset = HEADER.length;
  const paths = Array.from({ length: STAGES }, () => Array.from({ length: SAMPLES }, () => ({ x: bytes[offset++] * 4, y: bytes[offset++] * 4 })));
  return configFromPaths(paths);
}
