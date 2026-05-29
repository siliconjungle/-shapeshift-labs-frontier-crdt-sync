import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const rounds = readPositiveInt(args.rounds, 9);
const outPath = args.out ? path.resolve(rootDir, args.out) : null;
let sink = 0;

function measure(fn, inner) {
  for (let i = 0; i < inner; i++) fn();
  const samples = new Array(rounds);
  for (let roundIndex = 0; roundIndex < rounds; roundIndex++) {
    const start = performance.now();
    for (let i = 0; i < inner; i++) fn();
    samples[roundIndex] = ((performance.now() - start) * 1000) / inner;
  }
  samples.sort((left, right) => left - right);
  return { median: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}
function runRow(name, inner, fn, extra = {}) {
  const timing = measure(fn, inner);
  return { fixture: name, medianUs: round(timing.median), p95Us: round(timing.p95), ...extra };
}
function printReport(report) {
  console.log(report.package + ' package benchmark');
  console.log('Node ' + report.node + ' on ' + report.platform + ', rounds=' + rounds);
  console.log('These are Frontier-only package measurements, not competitor comparisons.');
  console.log('');
  console.log(padRight('Fixture', 44) + padLeft('Median', 12) + padLeft('p95', 11));
  for (const row of report.rows) {
    console.log(padRight(row.fixture, 44) + padLeft(formatUs(row.medianUs), 12) + padLeft(formatUs(row.p95Us), 11));
  }
  if (outPath) console.log('\nwrote ' + path.relative(rootDir, outPath));
}
function finish(packageName, rows) {
  const report = { package: packageName, version: readPackageVersion(), generatedAt: new Date().toISOString(), node: process.version, platform: process.platform + ' ' + process.arch, rounds, rows };
  if (outPath) { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n'); }
  printReport(report);
  if (sink === 42) console.log('sink=' + sink);
}
function percentile(sorted, fraction) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))]; }
function readPackageVersion() { return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version; }
function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i++) { const arg = argv[i]; if (arg === '--rounds') out.rounds = argv[++i]; else if (arg === '--out') out.out = argv[++i]; else if (arg === '--help' || arg === '-h') { console.log('Usage: npm run bench -- [--rounds 9] [--out benchmarks/results/package-bench.json]'); process.exit(0); } else throw new Error('unknown argument: ' + arg); } return out; }
function readPositiveInt(value, fallback) { if (value === undefined) return fallback; const number = Number(value); if (!Number.isInteger(number) || number <= 0) throw new Error('expected positive integer, got ' + value); return number; }
function round(value) { return Math.round(value * 100) / 100; }
function formatUs(value) { return value >= 1000 ? (value / 1000).toFixed(2) + ' ms' : value.toFixed(2) + ' us'; }
function padRight(value, width) { return String(value).padEnd(width); }
function padLeft(value, width) { return String(value).padStart(width); }

import { createCrdtDocument } from '@shapeshift-labs/frontier-crdt';
import {
  createCrdtSyncEndpoint,
  createCrdtSyncGhostState,
  decodeCrdtSyncMessage,
  encodeCrdtSyncMessage,
  createCrdtMemoryStorageAdapter,
  createCrdtSyncModelChecker
} from '../dist/index.js';
import {
  createCrdtSyncLazyBodyStore,
  createCrdtSyncLazyUpdateMessage,
  hydrateCrdtSyncLazyUpdateMessage
} from '../dist/lazy-body.js';
import { createCrdtSyncReplayArtifactStore } from '../dist/forensics.js';

const ghostFixture = createGhostBenchmarkFixture();
const ghostPayload = {
  replayBytes: replayMissingFrameDeltas(),
  unionBytes: ghostUnionRepairDelta()
};
const lazyFixture = createLazyUpdateFixture();

const rows = [
  runRow('Sync open/update/ack exchange', 500, () => { const result = syncOnce(); sink += result; }),
  runRow('Tiered sparse sync exchange', 120, () => { const result = tieredSyncOnce(); sink += result; }),
  runRow('Lost-frame replay delta encode', 300, () => { sink += replayMissingFrameDeltas(); }, { bytes: ghostPayload.replayBytes }),
  runRow('Ghost union repair delta encode', 300, () => { sink += ghostUnionRepairDelta(); }, { bytes: ghostPayload.unionBytes }),
  runRow('Eager large update encode/decode', 600, () => { sink += eagerLargeUpdateOnce(); }, { bytes: lazyFixture.eagerBytes }),
  runRow('Lazy large update advertise/fetch', 600, () => { sink += lazyLargeUpdateOnce(); }, { bytes: lazyFixture.lazyBytes, eagerBytes: lazyFixture.eagerBytes }),
  runRow('Sync message encode/decode', 3000, () => { const message = makeMessage(); sink += decodeCrdtSyncMessage(encodeCrdtSyncMessage(message)).stateVector?.['sync-a'] || 0; }),
  runRow('Model queue duplicate/drop', 1000, () => { sink += modelQueueOnce(); }),
  runRow('Replay artifact append/checkpoint', 1000, () => { sink += replayArtifactOnce(); }),
  runRow('Memory storage update append', 1000, () => { const storage = createCrdtMemoryStorageAdapter(); const doc = createCrdtDocument({ actorId: 'storage-a' }); doc.set('/title', 'hello'); storage.appendUpdate('doc', doc.exportUpdate()); sink++; })
];
finish('@shapeshift-labs/frontier-crdt-sync', rows);
function syncOnce() { const alice = createCrdtDocument({ actorId: 'sync-a' }); const bob = createCrdtDocument({ actorId: 'sync-b' }); alice.set('/title', 'hello'); const a = createCrdtSyncEndpoint(alice, { documentId: 'doc', senderId: 'alice' }); const b = createCrdtSyncEndpoint(bob, { documentId: 'doc', senderId: 'bob' }); const update = a.receive('bob', b.open('alice')); if (update) b.receive('alice', update); return bob.toJSON().title.length; }
function tieredSyncOnce() { const source = createCrdtDocument({ actorId: 'tiered-source' }); const updates = []; for (let i = 0; i < 192; i++) updates.push(source.set('/items/k' + i, { i }).update); const peer = createCrdtDocument({ actorId: 'tiered-peer' }); for (let i = 0; i < updates.length; i++) if (i % 5 !== 2) peer.applyUpdate(updates[i]); const sourceEndpoint = createCrdtSyncEndpoint(source, { documentId: 'tiered-doc', senderId: 'source', actorRangeSync: true }); const peerEndpoint = createCrdtSyncEndpoint(peer, { documentId: 'tiered-doc', senderId: 'peer', actorRangeSync: true }); const update = sourceEndpoint.receive('peer', peerEndpoint.open('source')); if (update) peerEndpoint.receive('source', update); return peer.toJSON().items.k191.i; }
function makeMessage() { const doc = createCrdtDocument({ actorId: 'sync-a' }); doc.set('/title', 'hello'); const endpoint = createCrdtSyncEndpoint(doc, { documentId: 'doc', senderId: 'alice' }); return endpoint.open('bob'); }
function modelQueueOnce() { const checker = createCrdtSyncModelChecker(); const a = checker.connect('a'); checker.connect('b', () => {}); a.send('b', { type: 'ack', senderId: 'a', documentId: 'doc', stateVector: {} }); checker.duplicateNext(); checker.dropNext(); return checker.snapshot().dropped + checker.snapshot().duplicated; }
function replayArtifactOnce() { const store = createCrdtSyncReplayArtifactStore({ now: () => 1 }); store.append([{ type: 'connect', peerId: 'a' }, { type: 'connect', peerId: 'b' }, { type: 'drain', maxSteps: 2 }], { minimized: true }); const read = store.read({ sinceSeq: 0 }); const checkpoint = store.checkpoint(); return read.length + checkpoint.cursor.offset; }
function createGhostBenchmarkFixture() { const actor = 'ghost-source'; const source = createCrdtDocument({ actorId: actor }); const frames = []; let previousSeq = 0; for (let frame = 0; frame < 16; frame++) { for (let row = 0; row < 8; row++) source.set('/entities/e' + frame + '-' + row, { frame, row, x: row * 2, y: frame * 3 }); const endSeq = source.getStateVector()[actor]; frames[frames.length] = { startSeq: previousSeq, endSeq }; previousSeq = endSeq; } const ackFrame = 3; return { actor, source, frames, ackRange: { actor, start: 1, end: frames[ackFrame].endSeq }, missingFrames: frames.slice(ackFrame + 1) }; }
function replayMissingFrameDeltas() { let bytes = 0; for (let i = 0; i < ghostFixture.missingFrames.length; i++) { const frame = ghostFixture.missingFrames[i]; bytes += ghostFixture.source.exportChangesBetween(versionForSeq(ghostFixture.actor, frame.startSeq), versionForSeq(ghostFixture.actor, frame.endSeq)).byteLength; } return bytes; }
function ghostUnionRepairDelta() { const ghost = createCrdtSyncGhostState({ ackedRanges: [ghostFixture.ackRange] }); const delta = ghost.createRepairDelta(ghostFixture.source); return delta === undefined ? 0 : delta.update.byteLength; }
function versionForSeq(actor, seq) { return seq <= 0 ? [] : [actor + ':' + seq]; }
function createLazyUpdateFixture() { const doc = createCrdtDocument({ actorId: 'lazy-large-source' }); for (let i = 0; i < 24; i++) doc.set('/assets/a' + i, { mime: 'text/plain', body: 'lazy-body-' + i + ':' + 'x'.repeat(768) }); const peer = createCrdtDocument({ actorId: 'lazy-large-peer' }); const sourceEndpoint = createCrdtSyncEndpoint(doc, { documentId: 'lazy-large-doc', senderId: 'source' }); const peerEndpoint = createCrdtSyncEndpoint(peer, { documentId: 'lazy-large-doc', senderId: 'peer' }); const message = sourceEndpoint.receive('peer', peerEndpoint.open('source')); const store = createCrdtSyncLazyBodyStore(); const lazy = createCrdtSyncLazyUpdateMessage(message, store, { thresholdBytes: 1 }); return { message, store, eagerBytes: encodeCrdtSyncMessage(message).byteLength, lazyBytes: encodeCrdtSyncMessage(lazy).byteLength }; }
function eagerLargeUpdateOnce() { const decoded = decodeCrdtSyncMessage(encodeCrdtSyncMessage(lazyFixture.message)); return decoded.update?.byteLength || 0; }
function lazyLargeUpdateOnce() { const lazy = createCrdtSyncLazyUpdateMessage(lazyFixture.message, lazyFixture.store, { thresholdBytes: 1 }); const decoded = decodeCrdtSyncMessage(encodeCrdtSyncMessage(lazy)); const hydrated = hydrateCrdtSyncLazyUpdateMessage(decoded, lazyFixture.store); return (hydrated.update?.byteLength || 0) + (decoded.updateBody?.byteLength || 0); }
