import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCrdtDocument } from '@shapeshift-labs/frontier-crdt';
import {
  checkCrdtSyncConvergence,
  createCrdtDocHandle,
  createCrdtMemoryStorageAdapter,
  createCrdtSyncEndpoint,
  createCrdtSyncGhostState,
  createCrdtDocumentUrl,
  decodeCrdtSyncMessage,
  encodeCrdtSyncMessage,
  parseCrdtDocumentUrl
} from '../dist/index.js';
import {
  createCrdtSyncModelReproArtifact,
  minimizeCrdtSyncModelReproScenario,
  replayCrdtSyncModelReproScenario
} from '../dist/model.js';

const args = parseArgs(process.argv.slice(2));
const cases = readPositiveInt(args.cases, 240);
const steps = readPositiveInt(args.steps, 28);
let seed = readSeed(args.seed, 0x7c91f2d5);

for (let caseIndex = 0; caseIndex < cases; caseIndex++) {
  await runCase(caseIndex);
}

console.log(`frontier crdt-sync fuzz passed cases=${cases} steps=${steps} seed=${readSeed(args.seed, 0x7c91f2d5)}`);

async function runCase(caseIndex) {
  const peerCount = 2 + randInt(3);
  const peers = [];
  const schedule = [];
  for (let i = 0; i < peerCount; i++) {
    const id = `peer-${caseIndex}-${i}`;
    const actorId = `actor-${caseIndex}-${i}`;
    const doc = createCrdtDocument({ actorId });
    peers.push({
      id,
      actorId,
      doc,
      history: [],
      endpoint: createCrdtSyncEndpoint(doc, {
        documentId: `doc-${caseIndex}`,
        senderId: id,
        actorRangeSync: true
      })
    });
  }

  for (let step = 0; step < steps; step++) {
    const choice = randInt(10);
    if (choice < 6) {
      const peer = peers[randInt(peerCount)];
      const op = mutate(peer.doc, caseIndex, step);
      if (op !== undefined) peer.history.push(op);
    } else {
      await syncPair(peers[randInt(peerCount)], peers[randInt(peerCount)], schedule);
    }
  }

  for (let round = 0; round < peerCount + 2; round++) {
    for (let left = 0; left < peerCount; left++) {
      for (let right = 0; right < peerCount; right++) {
        if (left !== right) await syncPair(peers[left], peers[right], schedule);
      }
    }
  }

  const convergence = checkCrdtSyncConvergence(peers.map((peer) => peer.doc));
  if (!convergence.valid) {
    const artifactPath = await exportFuzzReproArtifact(caseIndex, peers, schedule);
    console.error('wrote CRDT sync fuzz repro artifact: ' + artifactPath);
  }
  assert.strictEqual(convergence.valid, true, JSON.stringify(convergence.mismatches));
  fuzzGhostState(caseIndex);
  await fuzzStorage(caseIndex, peers[0].doc.exportUpdate());
  fuzzUrls(caseIndex);
}

function mutate(doc, caseIndex, step) {
  const view = doc.toJSON() || {};
  switch (randInt(7)) {
    case 0: {
      const path = `/items/k${randInt(8)}`;
      const value = { caseIndex, step, value: randInt(1000) };
      doc.set(path, value);
      return { type: 'set', path, value };
    }
    case 1: {
      const path = `/items/k${randInt(8)}`;
      doc.delete(path);
      return { type: 'delete', path };
    }
    case 2: {
      const text = typeof view.body === 'string' ? view.body : '';
      const index = randInt(text.length + 1);
      const insert = String.fromCharCode(97 + randInt(26));
      doc.text('/body').insert(index, insert);
      return { type: 'text-insert', path: '/body', index, text: insert };
    }
    case 3: {
      const text = typeof view.body === 'string' ? view.body : '';
      if (text.length > 0) {
        const index = randInt(text.length);
        doc.text('/body').delete(index, 1);
        return { type: 'text-delete', path: '/body', index, count: 1 };
      }
      break;
    }
    case 4: {
      const delta = randInt(5) - 2;
      doc.counter('/count').increment(delta);
      return { type: 'counter', path: '/count', delta };
    }
    case 5: {
      const list = Array.isArray(view.list) ? view.list : [];
      const index = randInt(list.length + 1);
      const value = { step, n: randInt(32) };
      doc.list('/list').insert(index, value);
      return { type: 'list-insert', path: '/list', index, value };
    }
    default: {
      const list = Array.isArray(view.list) ? view.list : [];
      if (list.length > 0) {
        const index = randInt(list.length);
        doc.list('/list').delete(index, 1);
        return { type: 'list-delete', path: '/list', index, count: 1 };
      }
      break;
    }
  }
  return undefined;
}

async function syncPair(left, right, schedule) {
  if (left === right) return;
  schedule.push({ type: 'sync', from: right.id, to: left.id }, { type: 'drain', maxSteps: 64 });
  await driveSync(left, right);
  schedule.push({ type: 'sync', from: left.id, to: right.id }, { type: 'drain', maxSteps: 64 });
  await driveSync(right, left);
}

async function driveSync(source, target) {
  let sender = target;
  let receiver = source;
  let message = target.endpoint.open(source.id);
  for (let guard = 0; guard < 16 && message !== undefined; guard++) {
    const transported = randInt(2) === 0
      ? encodeCrdtSyncMessage(message)
      : decodeCrdtSyncMessage(encodeCrdtSyncMessage(message));
    const reply = receiver.endpoint.receive(sender.id, transported);
    message = reply;
    const nextSender = receiver;
    receiver = sender;
    sender = nextSender;
  }
}

async function fuzzStorage(caseIndex, update) {
  const storage = createCrdtMemoryStorageAdapter();
  const events = [];
  storage.subscribe((event) => events.push(event.type));
  await storage.appendUpdate(`stored-${caseIndex}`, update);
  const handle = createCrdtDocHandle({
    documentId: `stored-${caseIndex}`,
    peerId: 'storage-peer',
    actorId: `storage-actor-${caseIndex}`,
    storage
  });
  await handle.load();
  await handle.set('/storageTouched', true);
  await handle.saveSnapshot({ includeView: true });
  await handle.compactStorage({ includeView: true });
  assert.ok((await storage.loadUpdates(`stored-${caseIndex}`)).length >= 0);
  assert.ok(events.includes('append-update'));
}

function fuzzGhostState(caseIndex) {
  const source = createCrdtDocument({ actorId: `ghost-source-${caseIndex}` });
  const client = createCrdtDocument({ actorId: `ghost-client-${caseIndex}` });
  const ghost = createCrdtSyncGhostState();
  for (let frame = 0; frame < 8; frame++) {
    const writes = 1 + randInt(4);
    for (let i = 0; i < writes; i++) {
      source.set(`/ghost/e${frame}-${i}`, { frame, i, value: randInt(1024) });
    }
    const delta = ghost.createDelta(source);
    if (delta === undefined) continue;
    if (randInt(3) === 0 && clientCoversBasis(client, delta.basisRanges)) {
      client.applyUpdate(delta.update);
      ghost.markAcked(delta.ranges);
    }
  }
  const repair = ghost.createRepairDelta(source);
  if (repair !== undefined) {
    client.applyUpdate(repair.update);
    ghost.markAcked(repair.ranges);
  }
  assert.deepStrictEqual(client.toJSON(), source.toJSON());
}

function clientCoversBasis(client, basisRanges) {
  const stateVector = client.getStateVector();
  for (let i = 0; i < basisRanges.length; i++) {
    const range = basisRanges[i];
    if ((stateVector[range.actor] || 0) < range.end) return false;
  }
  return true;
}

function fuzzUrls(caseIndex) {
  const url = createCrdtDocumentUrl(`doc/${caseIndex}`, {
    peerId: `peer-${randInt(16)}`,
    branch: randInt(2) === 0 ? 'main' : 'draft',
    params: {
      room: `r${randInt(8)}`,
      empty: null,
      enabled: true
    }
  });
  const parsed = parseCrdtDocumentUrl(url);
  assert.strictEqual(parsed.documentId, `doc/${caseIndex}`);
  assert.ok(parsed.peerId?.startsWith('peer-'));
  assert.strictEqual(parsed.params.enabled, 'true');
}

async function exportFuzzReproArtifact(caseIndex, peers, schedule) {
  const scenario = {
    documentId: `doc-${caseIndex}`,
    peers: peers.map((peer) => ({
      peerId: peer.id,
      actorId: peer.actorId,
      history: peer.history
    })),
    schedule
  };
  const predicate = async (candidate) => {
    const replay = await replayCrdtSyncModelReproScenario(candidate);
    return !replay.convergence.valid;
  };
  const minimized = await predicate(scenario)
    ? await minimizeCrdtSyncModelReproScenario(scenario, predicate)
    : scenario;
  const replay = await replayCrdtSyncModelReproScenario(minimized);
  const artifact = createCrdtSyncModelReproArtifact(minimized, {
    original: scenario,
    replay,
    note: `fuzz case ${caseIndex}`
  });
  const reproDir = process.env.FRONTIER_CRDT_SYNC_REPRO_DIR ||
    path.join(os.tmpdir(), 'frontier-crdt-sync-repros');
  await fs.mkdir(reproDir, { recursive: true });
  const artifactPath = path.join(reproDir, `crdt-sync-fuzz-${caseIndex}-${Date.now()}.json`);
  await fs.writeFile(artifactPath, JSON.stringify(artifact, null, 2) + '\n');
  return artifactPath;
}

function randInt(max) {
  return nextRandom() % max;
}

function nextRandom() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cases') out.cases = argv[++i];
    else if (arg === '--steps') out.steps = argv[++i];
    else if (arg === '--seed') out.seed = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node test/fuzz.mjs [--cases 240] [--steps 28] [--seed number]');
      process.exit(0);
    } else {
      throw new Error('unknown argument: ' + arg);
    }
  }
  return out;
}

function readPositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error('expected positive integer, got ' + value);
  return number;
}

function readSeed(value, fallback) {
  if (value === undefined) return fallback >>> 0;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error('expected integer seed, got ' + value);
  return number >>> 0;
}
