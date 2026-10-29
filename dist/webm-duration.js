/**
 * Conservative Duration repair for this game's MediaRecorder WebM files.
 * https://www.matroska.org/technical/elements.html — Duration uses Segment ticks.
 * https://www.rfc-editor.org/rfc/rfc8794.html — VINTs and unknown-size masters.
 * Unsupported layouts return the original data; this is not a general remuxer.
 */
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_ELEMENTS = 20_000;
const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TRACKS = 0x1654ae6b;
const CLUSTER = 0x1f43b675;
const SEEK_HEAD = 0x114d9b74;
const CUES = 0x1c53bb6b;
const VOID = 0xec;
const DURATION = 0x4489;
const TIMESTAMP_SCALE = 0x2ad7b1;
const TOP_LEVEL = new Set([INFO, TRACKS, CLUSTER, SEEK_HEAD, CUES]);
const HEADER_FIELDS = new Set([0x4286, 0x42f7, 0x42f2, 0x42f3, 0x4282, 0x4287, 0x4285, VOID]);
const INFO_FIELDS = new Set([TIMESTAMP_SCALE, DURATION, 0x4d80, 0x5741, 0x4461, 0x73a4, 0x7384, VOID]);

function integer(bytes, start, length) {
  if (length < 1 || length > 8) throw new Error('Invalid integer size');
  let value = 0;
  for (let index = start; index < start + length; index += 1) value = value * 256 + bytes[index];
  if (!Number.isSafeInteger(value)) throw new Error('Unsafe integer');
  return value;
}

function vint(bytes, start, limit, id = false) {
  if (start >= limit || bytes[start] === 0) throw new Error('Invalid VINT');
  let width = 1;
  let marker = 0x80;
  while (!(bytes[start] & marker)) { marker >>= 1; width += 1; }
  if (width > (id ? 4 : 8) || start + width > limit) throw new Error('Truncated VINT');
  if (id) return { value: integer(bytes, start, width), width, unknown: false };
  let value = bytes[start] & (marker - 1);
  let unknown = value === marker - 1;
  for (let index = 1; index < width; index += 1) {
    value = value * 256 + bytes[start + index];
    unknown = unknown && bytes[start + index] === 0xff;
  }
  if (!unknown && !Number.isSafeInteger(value)) throw new Error('Unsafe size');
  return { value: unknown ? null : value, width, unknown };
}

function element(bytes, start, limit, budget) {
  if (++budget.count > MAX_ELEMENTS) throw new Error('Element budget exceeded');
  const id = vint(bytes, start, limit, true);
  const sizeOffset = start + id.width;
  const size = vint(bytes, sizeOffset, limit);
  const data = sizeOffset + size.width;
  const end = size.unknown ? null : data + size.value;
  if (end !== null && end > limit) throw new Error('Element exceeds its parent');
  return { id: id.value, start, data, end, size: size.value, sizeOffset, sizeWidth: size.width, unknown: size.unknown };
}

function checkHeader(bytes, header, budget) {
  if (header.id !== EBML || header.unknown || header.size > 16_384) throw new Error('Unsupported EBML header');
  let docType = false;
  for (let offset = header.data; offset < header.end;) {
    const child = element(bytes, offset, header.end, budget);
    if (child.unknown || !HEADER_FIELDS.has(child.id)) throw new Error('Unsupported EBML header field');
    if (child.id === 0x4282) {
      if (docType || child.size !== 4 || bytes[child.data] !== 0x77 || bytes[child.data + 1] !== 0x65
        || bytes[child.data + 2] !== 0x62 || bytes[child.data + 3] !== 0x6d) throw new Error('Not a WebM document');
      docType = true;
    }
    if (child.id === 0x42f2 && integer(bytes, child.data, child.size) !== 4) throw new Error('Unsupported ID width');
    if (child.id === 0x42f3) {
      const width = integer(bytes, child.data, child.size);
      if (width < 1 || width > 8) throw new Error('Unsupported size width');
    }
    offset = child.end;
  }
  if (!docType) throw new Error('Missing WebM DocType');
}

function readInfo(bytes, info, budget) {
  if (info.unknown || info.size > 65_536) throw new Error('Unsupported Info');
  let scale = 1_000_000;
  let scaleSeen = false;
  let duration = null;
  for (let offset = info.data; offset < info.end;) {
    const child = element(bytes, offset, info.end, budget);
    // CRC-32 is deliberately unsupported: changing Info would invalidate it.
    if (child.unknown || !INFO_FIELDS.has(child.id)) throw new Error('Unsupported Info field');
    if (child.id === TIMESTAMP_SCALE) {
      if (scaleSeen) throw new Error('Duplicate TimestampScale');
      scale = integer(bytes, child.data, child.size);
      if (scale <= 0) throw new Error('Invalid TimestampScale');
      scaleSeen = true;
    } else if (child.id === DURATION) {
      if (duration || (child.size !== 4 && child.size !== 8)) throw new Error('Invalid Duration');
      duration = child;
    }
    offset = child.end;
  }
  return { scale, duration };
}

function scanCluster(bytes, cluster, limit, budget, state) {
  const end = cluster.unknown ? limit : cluster.end;
  let timestamp = null;
  let blocks = 0;
  let offset = cluster.data;
  while (offset < end) {
    const child = element(bytes, offset, end, budget);
    // Only a schema-level sibling ends an unknown-size Cluster. Never search
    // for ID byte patterns inside compressed video payloads.
    if (cluster.unknown && TOP_LEVEL.has(child.id)) break;
    if (child.unknown) throw new Error('Unknown-size Cluster child');
    if (child.id === 0xe7) {
      if (timestamp !== null) throw new Error('Duplicate Cluster timestamp');
      timestamp = integer(bytes, child.data, child.size);
    } else if (child.id === 0xa3) {
      if (timestamp === null) throw new Error('Block precedes Cluster timestamp');
      const track = vint(bytes, child.data, child.end);
      if (track.unknown || !track.value || child.size < track.width + 4) throw new Error('Truncated SimpleBlock');
      const relative = new DataView(bytes.buffer, bytes.byteOffset + child.data + track.width, 2).getInt16(0);
      state.maxTimestamp = Math.max(state.maxTimestamp, timestamp + relative);
      blocks += 1;
    } else if (child.id === 0xa7 || child.id === 0xab) {
      // Position is relative to Segment data. Preserve these files byte-for-byte
      // unless an existing Duration can be patched without moving any data.
      integer(bytes, child.data, child.size);
      state.positions = true;
    } else if (child.id !== VOID) {
      throw new Error('Unsupported Cluster layout');
    }
    offset = child.end;
  }
  if (timestamp === null || !blocks) throw new Error('Empty Cluster');
  return offset;
}

function sizeBytes(value, width) {
  if (value >= 2 ** (7 * width) - 1) return null;
  const result = new Uint8Array(width);
  for (let index = width - 1; index >= 0; index -= 1) {
    result[index] = value % 256;
    value = Math.floor(value / 256);
  }
  result[0] |= 1 << (8 - width);
  return result;
}

/** Return a new buffer only for a proven-safe repair; never mutate bytes. */
export function patchWebmDuration(bytes, durationMs) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_BYTES
    || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 60_000) return bytes;
  try {
    const budget = { count: 0 };
    const header = element(bytes, 0, bytes.length, budget);
    checkHeader(bytes, header, budget);
    const segment = element(bytes, header.end, bytes.length, budget);
    if (segment.id !== SEGMENT || (!segment.unknown && segment.end !== bytes.length)) return bytes;
    const end = segment.unknown ? bytes.length : segment.end;
    const state = { indexed: false, positions: false, maxTimestamp: 0 };
    let info = null;
    let metadata = null;
    let tracks = 0;
    let clusters = 0;
    let firstCluster = Infinity;
    for (let offset = segment.data; offset < end;) {
      const child = element(bytes, offset, end, budget);
      if (child.id === INFO) {
        if (info) return bytes;
        info = child;
        metadata = readInfo(bytes, child, budget);
      } else if (child.id === TRACKS) {
        if (child.unknown || ++tracks > 1 || child.size === 0) return bytes;
      } else if (child.id === CLUSTER) {
        firstCluster = Math.min(firstCluster, child.start);
        clusters += 1;
        offset = scanCluster(bytes, child, end, budget, state);
        continue;
      } else if (child.id === SEEK_HEAD || child.id === CUES) {
        if (child.unknown) return bytes;
        state.indexed = true;
      } else if (child.id !== VOID || child.unknown) {
        // Includes Segment CRC-32, concatenated documents, and unknown masters.
        return bytes;
      }
      offset = child.end;
    }
    if (!info || tracks !== 1 || !clusters) return bytes;
    const ticks = durationMs * 1_000_000 / metadata.scale;
    if (!Number.isFinite(ticks) || ticks <= 0 || ticks < state.maxTimestamp) return bytes;
    if (metadata.duration) {
      const duration = metadata.duration;
      const view = new DataView(bytes.buffer, bytes.byteOffset + duration.data, duration.size);
      const existing = duration.size === 4 ? view.getFloat32(0) : view.getFloat64(0);
      if (Number.isFinite(existing) && existing > 0) return bytes;
      const result = new Uint8Array(bytes);
      const updated = new DataView(result.buffer, duration.data, duration.size);
      if (duration.size === 4) updated.setFloat32(0, ticks);
      else updated.setFloat64(0, ticks);
      return result;
    }
    // Insertion shifts later Segment positions. It is only safe in the simple,
    // unindexed streaming layout that this game's recorder actually produces.
    if (!segment.unknown || state.indexed || state.positions || info.start > firstCluster) return bytes;
    const nextSize = sizeBytes(info.size + 11, info.sizeWidth);
    if (!nextSize) return bytes; // Do not widen headers or rewrite offsets.
    const duration = new Uint8Array(11);
    duration.set([0x44, 0x89, 0x88]);
    new DataView(duration.buffer).setFloat64(3, ticks);
    const result = new Uint8Array(bytes.length + duration.length);
    result.set(bytes.subarray(0, info.end));
    result.set(duration, info.end);
    result.set(bytes.subarray(info.end), info.end + duration.length);
    result.set(nextSize, info.sizeOffset);
    return result;
  } catch { return bytes; }
}

/** Best-effort metadata only: unsupported/failed repairs preserve the same Blob. */
export async function fixWebmDuration(blob, durationMs) {
  if (!blob || !/^video\/webm(?:;|$)/i.test(blob.type) || blob.size > MAX_BYTES
    || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 60_000) return blob;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const repaired = patchWebmDuration(bytes, durationMs);
    return repaired === bytes ? blob : new Blob([repaired], { type: blob.type });
  } catch { return blob; }
}
