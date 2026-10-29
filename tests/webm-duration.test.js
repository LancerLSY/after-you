import test from 'node:test';
import assert from 'node:assert/strict';
import { fixWebmDuration, patchWebmDuration } from '../dist/webm-duration.js';

const ids = { ebml: 0x1a45dfa3, segment: 0x18538067, info: 0x1549a966, tracks: 0x1654ae6b, cluster: 0x1f43b675 };
const concat = (...parts) => Buffer.concat(parts.map(part => Buffer.from(part)));
const idBytes = id => Buffer.from(id.toString(16).padStart(Math.ceil(id.toString(16).length / 2) * 2, '0'), 'hex');
function uint(value, width = 1) {
  const bytes = Buffer.alloc(width);
  for (let i = width - 1; i >= 0; i -= 1) { bytes[i] = value % 256; value = Math.floor(value / 256); }
  return bytes;
}
function el(id, data = [], { unknown = false, width } = {}) {
  const payload = Buffer.from(data);
  if (unknown) return concat(idBytes(id), [1, 255, 255, 255, 255, 255, 255, 255], payload);
  width ||= payload.length < 127 ? 1 : 2;
  const size = uint(payload.length, width);
  size[0] |= 1 << (8 - width);
  return concat(idBytes(id), size, payload);
}
function fixture(options = {}) {
  const header = el(ids.ebml, concat(el(0x4282, Buffer.from('webm')), el(0x42f2, [4]), el(0x42f3, [8])));
  const scale = options.scale === false ? Buffer.alloc(0) : el(0x2ad7b1, uint(options.scale || 1_000_000, 3));
  const app = el(0x4d80, Buffer.from('Test'));
  let duration = Buffer.alloc(0);
  const durationWidth = options.durationWidth || 8;
  if ('duration' in options) {
    const value = Buffer.alloc(durationWidth);
    if (durationWidth === 4) value.writeFloatBE(options.duration);
    else value.writeDoubleBE(options.duration);
    duration = el(0x4489, value);
  }
  const padding = options.padding ? el(0xec, Buffer.alloc(options.padding)) : Buffer.alloc(0);
  const info = el(ids.info, concat(scale, app, duration, padding, options.extraInfo || []), { unknown: options.unknownInfo });
  const video = el(0xe0, concat(el(0xb0, uint(720, 2)), el(0xba, uint(960, 2))));
  const entry = el(0xae, concat(el(0xd7, [1]), el(0x83, [1]), el(0x86, Buffer.from('V_VP8')), video));
  const tracks = el(ids.tracks, entry, { unknown: options.unknownTracks });
  const timestamp = el(0xe7, uint(options.timestamp || 0, 2));
  // Contains a fake SeekHead ID inside compressed payload: a correct parser
  // skips it using the SimpleBlock size instead of scanning for magic bytes.
  const block = el(0xa3, [0x81, 0, 33, 0x80, 0x11, 0x4d, 0x9b, 0x74, 0x00, 0x01]);
  const position = options.position ? el(0xa7, uint(100, 2)) : Buffer.alloc(0);
  const cluster = el(ids.cluster, concat(timestamp, block, position, options.clusterExtra || []), { unknown: options.clusterUnknown !== false });
  const seek = options.seek ? el(0x114d9b74, el(0x4dbb, concat(el(0x53ab, idBytes(ids.cluster)), el(0x53ac, uint(0, 4))))) : Buffer.alloc(0);
  const cues = options.cues ? el(0x1c53bb6b, el(0xbb, concat(el(0xb3, [0]), el(0xb7, concat(el(0xf7, [1]), el(0xf1, uint(0, 4))))))) : Buffer.alloc(0);
  const before = concat(seek, options.before || []);
  const body = concat(before, info, tracks, options.extraSegment || [], cluster, cues, options.after || []);
  const segment = el(ids.segment, body, { unknown: !options.knownSegment, width: options.knownSegment ? 3 : undefined });
  const bytes = concat(header, segment);
  const segmentData = header.length + segment.length - body.length;
  const infoStart = segmentData + before.length;
  const infoEnd = infoStart + info.length;
  const infoData = infoEnd - (scale.length + app.length + duration.length + padding.length + (options.extraInfo?.length || 0));
  const durationData = duration.length ? infoData + scale.length + app.length + 3 : null;
  const clusterStart = segmentData + before.length + info.length + tracks.length + (options.extraSegment?.length || 0);
  // Use actual Segment-relative positions so unchanged offsets are meaningful.
  if (options.seek) bytes.writeUInt32BE(clusterStart - segmentData, segmentData + seek.length - 4);
  if (options.cues) bytes.writeUInt32BE(clusterStart - segmentData, clusterStart + cluster.length + cues.length - 4);
  return { bytes, infoStart, infoEnd, infoData, durationData, clusterStart, cluster, segmentData };
}

function floatAt(bytes, offset, width = 8) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, width);
  return width === 4 ? view.getFloat32(0) : view.getFloat64(0);
}

test('Chrome-style streaming layout gains Duration while every subsequent byte stays identical', () => {
  const original = fixture();
  const before = Buffer.from(original.bytes);
  const result = patchWebmDuration(original.bytes, 2_500);
  assert.notEqual(result, original.bytes);
  assert.equal(result.length, original.bytes.length + 11);
  assert.equal(floatAt(result, original.infoEnd + 3), 2_500);
  assert.deepEqual([...result.subarray(original.infoEnd, original.infoEnd + 3)], [0x44, 0x89, 0x88]);
  assert.equal(result[original.infoStart + 4], original.bytes[original.infoStart + 4] + 11);
  assert.deepEqual(Buffer.from(result.subarray(0, original.infoStart + 4)), original.bytes.subarray(0, original.infoStart + 4));
  assert.deepEqual(Buffer.from(result.subarray(original.infoStart + 5, original.infoEnd)), original.bytes.subarray(original.infoStart + 5, original.infoEnd));
  assert.deepEqual(Buffer.from(result.subarray(original.infoEnd + 11)), original.bytes.subarray(original.infoEnd), 'Tracks, Cluster headers and every video byte must be unchanged');
  assert.deepEqual(original.bytes, before, 'The caller buffer must not be mutated');
});

for (const width of [4, 8]) {
  test(`an existing ${width}-byte invalid Duration is patched in place without moving indexed data`, () => {
    const original = fixture({ duration: width === 4 ? 0 : NaN, durationWidth: width, knownSegment: true, seek: true, cues: true, position: true });
    const before = Buffer.from(original.bytes);
    const result = patchWebmDuration(original.bytes, 3_000);
    assert.notEqual(result, original.bytes);
    assert.equal(result.length, original.bytes.length);
    assert.equal(floatAt(result, original.durationData, width), 3_000);
    for (let offset = 0; offset < result.length; offset += 1) {
      if (offset < original.durationData || offset >= original.durationData + width) assert.equal(result[offset], original.bytes[offset]);
    }
    assert.deepEqual(original.bytes, before, 'Buffer subclasses must also remain immutable');
  });
}

test('finite existing Duration is preserved rather than overwritten with a wall-clock estimate', () => {
  const { bytes } = fixture({ duration: 2_400 });
  assert.equal(patchWebmDuration(bytes, 2_500), bytes);
});

test('TimestampScale is respected, including its default when the field is absent', () => {
  for (const [scale, expected] of [[500_000, 5_000], [false, 2_500]]) {
    const original = fixture({ scale });
    const result = patchWebmDuration(original.bytes, 2_500);
    assert.equal(floatAt(result, original.infoEnd + 3), expected);
  }
});

test('known-size Clusters are supported without rewriting their lengths', () => {
  const original = fixture({ clusterUnknown: false });
  const result = patchWebmDuration(original.bytes, 2_500);
  assert.notEqual(result, original.bytes);
  assert.deepEqual(Buffer.from(result.subarray(original.clusterStart + 11)), original.cluster);
});

test('multiple unknown-size Clusters terminate at sibling IDs, not byte patterns inside blocks', () => {
  const later = el(ids.cluster, concat(el(0xe7, uint(1_000, 2)), el(0xa3, [0x81, 0, 2, 0x80, 0x1c, 0x53, 0xbb, 0x6b])), { unknown: true });
  const original = fixture({ after: later });
  const result = patchWebmDuration(original.bytes, 2_500);
  assert.notEqual(result, original.bytes);
  assert.deepEqual(Buffer.from(result.subarray(original.infoEnd + 11)), original.bytes.subarray(original.infoEnd));
});

const unsupported = [
  ['known-size Segment without a Duration slot', { knownSegment: true }],
  ['SeekHead before Info', { seek: true }],
  ['Cues after an unknown-size Cluster', { cues: true }],
  ['Cluster Position references', { position: true }],
  ['Info CRC-32', { extraInfo: el(0xbf, [0, 0, 0, 0]) }],
  ['Segment CRC-32', { before: el(0xbf, [0, 0, 0, 0]) }],
  ['Cluster CRC-32', { clusterExtra: el(0xbf, [0, 0, 0, 0]) }],
  ['unknown-size Info', { unknownInfo: true }],
  ['unknown-size Tracks', { unknownTracks: true }],
  ['unknown Info field', { extraInfo: el(0x7fff, [1]) }],
  ['unsupported BlockGroup layout', { clusterExtra: el(0xa0, el(0xa1, [0x81, 0, 0, 0, 1])) }],
  ['Info size that would require a wider size VINT', { padding: 104 }],
  ['extra top-level metadata outside the supported layout', { extraSegment: el(0x1254c367, []) }],
  ['duplicate Info', { after: el(ids.info, el(0x4d80, [65])) }],
];
for (const [name, options] of unsupported) {
  test(`${name} is returned unchanged`, () => {
    const { bytes } = fixture(options);
    assert.equal(patchWebmDuration(bytes, 2_500), bytes);
  });
}

test('a shorter measured duration cannot truncate the final encoded timestamp', () => {
  const { bytes } = fixture({ timestamp: 5_000 });
  assert.equal(patchWebmDuration(bytes, 2_500), bytes);
});

test('truncated elements, invalid VINTs and concatenated documents are preserved', () => {
  const { bytes } = fixture();
  const variants = [bytes.subarray(0, -1), Buffer.from([0]), concat(bytes, bytes), Buffer.from(bytes)];
  variants[3][5] = 0;
  for (const malformed of variants) assert.equal(patchWebmDuration(malformed, 2_500), malformed);
});

test('invalid durations and excessive element counts cannot trigger a repair', () => {
  const { bytes } = fixture();
  for (const duration of [0, -1, NaN, Infinity, 60_001]) assert.equal(patchWebmDuration(bytes, duration), bytes);
  const crowded = fixture({ extraSegment: Buffer.alloc(40_002).fill(Buffer.from([0xec, 0x80])) }).bytes;
  assert.equal(patchWebmDuration(crowded, 2_500), crowded);
});

test('Blob wrapper preserves MIME and returns the original Blob for unsafe structures', async () => {
  const safe = fixture();
  const blob = new Blob([safe.bytes], { type: 'video/webm;codecs=vp8' });
  const result = await fixWebmDuration(blob, 2_500);
  assert.notEqual(result, blob);
  assert.equal(result.type, blob.type);
  assert.equal(floatAt(new Uint8Array(await result.arrayBuffer()), safe.infoEnd + 3), 2_500);
  const unsafe = new Blob([fixture({ cues: true }).bytes], { type: 'video/webm' });
  assert.equal(await fixWebmDuration(unsafe, 2_500), unsafe);
  const mp4 = new Blob([safe.bytes], { type: 'video/mp4' });
  assert.equal(await fixWebmDuration(mp4, 2_500), mp4);
});

test('Blob read failures and memory bounds return the original object without throwing', async () => {
  const unreadable = { type: 'video/webm', size: 100, arrayBuffer: async () => { throw new Error('read failed'); } };
  assert.equal(await fixWebmDuration(unreadable, 2_500), unreadable);
  const oversized = { type: 'video/webm', size: 32 * 1024 * 1024 + 1, arrayBuffer: () => { assert.fail('Oversized input must not be read'); } };
  assert.equal(await fixWebmDuration(oversized, 2_500), oversized);
});
