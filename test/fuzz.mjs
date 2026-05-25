import assert from 'node:assert';
import { createCrdtDocument } from '@shapeshift-labs/frontier-crdt';
import {
  checkCrdtSyncConvergence,
  createCrdtDocHandle,
  createCrdtMemoryStorageAdapter,
  createCrdtSyncEndpoint,
  createCrdtDocumentUrl,
  decodeCrdtSyncMessage,
  encodeCrdtSyncMessage,
  parseCrdtDocumentUrl
} from '../dist/index.js';

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
  for (let i = 0; i < peerCount; i++) {
    const id = `peer-${caseIndex}-${i}`;
    const doc = createCrdtDocument({ actorId: `actor-${caseIndex}-${i}` });
    peers.push({
      id,
      doc,
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
      mutate(peers[randInt(peerCount)].doc, caseIndex, step);
    } else {
      await syncPair(peers[randInt(peerCount)], peers[randInt(peerCount)]);
    }
  }

  for (let round = 0; round < peerCount + 2; round++) {
    for (let left = 0; left < peerCount; left++) {
      for (let right = 0; right < peerCount; right++) {
        if (left !== right) await syncPair(peers[left], peers[right]);
      }
    }
  }

  const convergence = checkCrdtSyncConvergence(peers.map((peer) => peer.doc));
  assert.strictEqual(convergence.valid, true, JSON.stringify(convergence.mismatches));
  await fuzzStorage(caseIndex, peers[0].doc.exportUpdate());
  fuzzUrls(caseIndex);
}

function mutate(doc, caseIndex, step) {
  const view = doc.toJSON() || {};
  switch (randInt(7)) {
    case 0:
      doc.set(`/items/k${randInt(8)}`, { caseIndex, step, value: randInt(1000) });
      break;
    case 1:
      doc.delete(`/items/k${randInt(8)}`);
      break;
    case 2: {
      const text = typeof view.body === 'string' ? view.body : '';
      const index = randInt(text.length + 1);
      doc.text('/body').insert(index, String.fromCharCode(97 + randInt(26)));
      break;
    }
    case 3: {
      const text = typeof view.body === 'string' ? view.body : '';
      if (text.length > 0) doc.text('/body').delete(randInt(text.length), 1);
      break;
    }
    case 4:
      doc.counter('/count').increment(randInt(5) - 2);
      break;
    case 5: {
      const list = Array.isArray(view.list) ? view.list : [];
      doc.list('/list').insert(randInt(list.length + 1), { step, n: randInt(32) });
      break;
    }
    default: {
      const list = Array.isArray(view.list) ? view.list : [];
      if (list.length > 0) doc.list('/list').delete(randInt(list.length), 1);
      break;
    }
  }
}

async function syncPair(left, right) {
  if (left === right) return;
  await driveSync(left, right);
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
