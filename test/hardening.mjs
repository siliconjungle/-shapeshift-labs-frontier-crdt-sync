import assert from 'node:assert';
import { createCrdtDocument } from '@shapeshift-labs/frontier-crdt';
import { decodeCrdtUpdate } from '@shapeshift-labs/frontier-crdt/update';
import { createCrdtUndoManager } from '@shapeshift-labs/frontier-crdt/undo';
import {
  checkCrdtSyncConvergence,
  createCrdtDocHandle,
  createCrdtLocalSyncNetwork,
  createCrdtMemoryStorageAdapter,
  createCrdtRepo,
  createCrdtSyncEndpoint,
  createCrdtSyncModelChecker,
  decodeCrdtSyncMessage,
  encodeCrdtSyncMessage
} from '../dist/index.js';
import {
  createCrdtSyncModelReproArtifact,
  minimizeCrdtSyncModelReproScenario,
  minimizeCrdtSyncModelSchedule,
  replayCrdtSyncModelReproScenario,
  summarizeCrdtSyncModelReproScenario,
  replayCrdtSyncModelSchedule
} from '../dist/model.js';

const args = parseArgs(process.argv.slice(2));
const soakCases = readPositiveInt(args.soakCases, 24);
const soakSteps = readPositiveInt(args.soakSteps, 40);
let seed = readSeed(args.seed, 0x71f0c0de);

await testProtocolValidation();
await testModelFaults();
await testReplayAndMinimize();
await testStorageContracts();
await testStorageCompactionSchedules();
await testProviderRepoScenarios();
await testRollbackConvergenceFixtures();
await testDeterministicSoak(soakCases, soakSteps);

console.log(`frontier crdt-sync hardening passed soakCases=${soakCases} soakSteps=${soakSteps} seed=${readSeed(args.seed, 0x71f0c0de)}`);

async function testProtocolValidation() {
  const encoder = new TextEncoder();
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'wrong',
    version: 1,
    type: 'ack',
    stateVector: {}
  }))), /envelope/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 2,
    type: 'ack',
    stateVector: {}
  }))), /envelope/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 1,
    type: 'unknown',
    stateVector: {}
  }))), /type/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 1,
    type: 'ack',
    stateVector: { alice: -1 }
  }))), /state vector/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 1,
    type: 'update',
    stateVector: {},
    update: '!!!!'
  }))), /base64/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 1,
    type: 'ack',
    stateVector: {},
    reconciliation: {
      version: 1,
      strategy: 'merkle-iblt',
      bucketSize: 0,
      rangeCount: 1,
      opCount: 1,
      cells: []
    }
  }))), /reconciliation/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 1,
    type: 'ack',
    stateVector: {},
    reconciliation: {
      version: 1,
      strategy: 'merkle-iblt',
      bucketSize: 4,
      rangeCount: 1,
      opCount: 1,
      cells: [{ actor: 'a', start: 1, end: 4, count: 5, hash: 1 }]
    }
  }))), /reconciliation cell/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 1,
    type: 'ack',
    stateVector: {},
    actorRanges: [{ actor: 'a', start: 1, end: 1 }],
    reconciliation: {
      version: 1,
      strategy: 'merkle-iblt',
      bucketSize: 4,
      rangeCount: 1,
      opCount: 1,
      cells: [{ actor: 'a', start: 1, end: 4, count: 1, hash: 1 }]
    }
  }))), /invalid CRDT sync message/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 1,
    type: 'update',
    stateVector: {},
    updateBody: {
      version: 1,
      kind: 'crdt-update',
      hash: 'sha256:not-supported-here',
      byteLength: 12,
      stateVector: {},
      actorRanges: []
    }
  }))), /lazy body reference/);
  assert.throws(() => decodeCrdtSyncMessage(encoder.encode(JSON.stringify({
    magic: 'frontier-crdt-sync',
    version: 1,
    type: 'update',
    stateVector: {},
    updateBody: {
      version: 1,
      kind: 'crdt-update',
      hash: 'fnv1a64:0000000000000000',
      byteLength: -1,
      stateVector: {},
      actorRanges: []
    }
  }))), /lazy body reference/);

  const alice = createCrdtDocument({ actorId: 'protocol-alice' });
  const bob = createCrdtDocument({ actorId: 'protocol-bob' });
  alice.set('/title', 'protocol');
  const aliceEndpoint = createCrdtSyncEndpoint(alice, { documentId: 'protocol-doc', senderId: 'alice' });
  const bobEndpoint = createCrdtSyncEndpoint(bob, { documentId: 'protocol-doc', senderId: 'bob' });

  assert.throws(() => bobEndpoint.receive('alice', {
    type: 'ack',
    documentId: 'wrong-doc',
    senderId: 'alice',
    stateVector: {}
  }), /different document/);
  assert.throws(() => bobEndpoint.receive({
    type: 'ack',
    documentId: 'protocol-doc',
    stateVector: {}
  }), /missing senderId/);
  assert.throws(() => bobEndpoint.receive('alice', {
    type: 'update',
    documentId: 'protocol-doc',
    senderId: 'alice',
    stateVector: alice.getStateVector()
  }), /missing update bytes/);

  const updateMessage = aliceEndpoint.createUpdate('bob');
  const encodedUpdateMessage = encodeCrdtSyncMessage(updateMessage);
  bobEndpoint.receive('alice', encodedUpdateMessage);
  bobEndpoint.receive('alice', encodedUpdateMessage);
  assert.deepStrictEqual(bob.toJSON(), { title: 'protocol' });
}

async function testModelFaults() {
  const model = createModelNetwork(3, 'fault-doc', 'fault');
  model.peers[0].doc.set('/fromA', 1);
  model.peers[1].doc.set('/fromB', 2);
  model.peers[2].doc.text('/body').insert(0, 'sync');

  model.sendOpen(0, 1);
  model.sendOpen(1, 0);
  model.sendOpen(2, 0);
  model.sendOpen(0, 2);
  const queued = model.checker.queueSnapshot();
  assert.ok(queued.length >= 2);
  await model.checker.deliver(queued[1].id);
  model.checker.duplicateNext(1);
  model.checker.dropNext(1);
  await model.checker.deliverNext();

  model.checker.partition(model.peers[0].id, model.peers[2].id);
  model.sendOpen(0, 2);
  model.checker.heal(model.peers[0].id, model.peers[2].id);

  model.checker.disconnect(model.peers[1].id);
  model.sendOpen(0, 1);
  model.attach(model.peers[1]);
  model.attach(model.peers[1]);

  await model.syncAll(5);
  const result = await model.checker.drain({ maxSteps: 1200 });
  assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
  const convergence = checkCrdtSyncConvergence(model.peers.map((peer) => ({ peerId: peer.id, doc: peer.doc })));
  assert.strictEqual(convergence.valid, true, JSON.stringify(convergence.mismatches));
  const snapshot = model.checker.snapshot();
  assert.ok(snapshot.delivered > 0);
  assert.ok(snapshot.dropped > 0);
  assert.ok(snapshot.duplicated > 0);
}

async function testReplayAndMinimize() {
  const checker = createCrdtSyncModelChecker();
  const delivered = [];
  const a = checker.connect('replay-a', (message, fromPeerId) => {
    delivered.push(['a', fromPeerId, decodeCrdtSyncMessage(message).type]);
  });
  checker.connect('replay-b', (message, fromPeerId) => {
    delivered.push(['b', fromPeerId, decodeCrdtSyncMessage(message).type]);
  });
  a.send('replay-b', { type: 'ack', senderId: 'replay-a', documentId: 'replay-doc', stateVector: {} });
  a.send('replay-b', { type: 'state-vector', senderId: 'replay-a', documentId: 'replay-doc', stateVector: {} });
  const secondId = checker.queueSnapshot()[1].id;
  const replay = await replayCrdtSyncModelSchedule(checker, [
    { type: 'duplicate-next', count: 1 },
    { type: 'deliver', messageId: secondId },
    { type: 'drop-next', count: 1 },
    { type: 'drain', maxSteps: 20 }
  ]);
  assert.strictEqual(replay.valid, true, JSON.stringify(replay.errors));
  assert.strictEqual(delivered[0][2], 'state-vector');
  assert.ok(replay.duplicated >= 1);
  assert.ok(replay.dropped >= 1);

  const schedule = [
    { type: 'connect', peerId: 'noise-a' },
    { type: 'heal' },
    { type: 'drop-next', count: 1 },
    { type: 'partition', left: 'noise-a', right: 'noise-b' },
    { type: 'deliver-next' },
    { type: 'drain', maxSteps: 2 },
    { type: 'disconnect', peerId: 'noise-a' }
  ];
  const predicate = async (candidate) => (
    candidate.some((action) => action.type === 'drop-next') &&
    candidate.some((action) => action.type === 'deliver-next')
  );
  const minimized = await minimizeCrdtSyncModelSchedule(schedule, predicate);
  assert.ok(minimized.length < schedule.length);
  assert.strictEqual(await predicate(minimized), true);

  const replayChecker = createCrdtSyncModelChecker();
  const lifecycle = await replayCrdtSyncModelSchedule(replayChecker, [
    { type: 'connect', peerId: 'life-a' },
    { type: 'connect', peerId: 'life-b' },
    { type: 'partition', left: 'life-a', right: 'life-b' },
    { type: 'heal', left: 'life-a', right: 'life-b' },
    { type: 'disconnect', peerId: 'life-b' },
    { type: 'drain', maxSteps: 1 }
  ], {
    connect() {
      return () => {};
    }
  });
  assert.strictEqual(lifecycle.valid, true);
  assert.deepStrictEqual(lifecycle.snapshot.peerIds, ['life-a']);

  const convergentReplay = await replayCrdtSyncModelReproScenario({
    documentId: 'repro-converges',
    peers: [
      {
        peerId: 'repro-converges-a',
        history: [{ type: 'set', path: '/title', value: 'ready' }]
      },
      { peerId: 'repro-converges-b', history: [] }
    ],
    schedule: [],
    finalSyncRounds: 2,
    finalDrainMaxSteps: 2000
  });
  assert.strictEqual(convergentReplay.valid, true, JSON.stringify(convergentReplay.errors));
  assert.deepStrictEqual(convergentReplay.views['repro-converges-b'], { title: 'ready' });

  const reproScenario = {
    documentId: 'repro-failure',
    peers: [
      {
        peerId: 'repro-a',
        actorId: 'repro-actor-a',
        history: [
          { type: 'set', path: '/keep', value: 'abcdefghijklmnopqrstuvwxyz' },
          { type: 'text-insert', path: '/body', index: 0, text: 'this text is removable noise' }
        ]
      },
      {
        peerId: 'repro-b',
        actorId: 'repro-actor-b',
        history: [
          { type: 'set', path: '/b-noise', value: { nested: true, payload: [1, 2, 3, 4] } }
        ]
      },
      {
        peerId: 'repro-c',
        actorId: 'repro-actor-c',
        history: [
          { type: 'set', path: '/c-noise', value: 'remove this peer' },
          { type: 'counter', path: '/count', delta: 7 },
          { type: 'list-insert', path: '/items', index: 0, value: { noisy: true, value: 123 } }
        ]
      }
    ],
    schedule: [
      { type: 'connect', peerId: 'repro-c' },
      { type: 'duplicate-next', count: 4 },
      { type: 'drop-next', count: 3 },
      { type: 'heal' },
      { type: 'deliver-next' },
      { type: 'drain', maxSteps: 12 },
      { type: 'disconnect', peerId: 'repro-c' }
    ]
  };
  const reproPredicate = async (candidate) => {
    const replay = await replayCrdtSyncModelReproScenario(candidate);
    const aView = replay.views['repro-a'];
    return !replay.convergence.valid &&
      aView &&
      typeof aView === 'object' &&
      typeof aView.keep === 'string' &&
      aView.keep.length > 0 &&
      candidate.peers.length >= 2 &&
      candidate.schedule.some((action) => action.type === 'drop-next') &&
      candidate.schedule.some((action) => action.type === 'deliver-next');
  };
  const originalSummary = summarizeCrdtSyncModelReproScenario(reproScenario);
  const minimizedRepro = await minimizeCrdtSyncModelReproScenario(reproScenario, reproPredicate);
  const minimizedSummary = summarizeCrdtSyncModelReproScenario(minimizedRepro);
  assert.strictEqual(await reproPredicate(minimizedRepro), true);
  assert.ok(minimizedSummary.peerCount < originalSummary.peerCount);
  assert.ok(minimizedSummary.operationCount < originalSummary.operationCount);
  assert.ok(minimizedSummary.scheduleLength < originalSummary.scheduleLength);
  assert.ok(minimizedSummary.contentBytes < originalSummary.contentBytes);
  const minimizedReplay = await replayCrdtSyncModelReproScenario(minimizedRepro);
  const artifact = createCrdtSyncModelReproArtifact(minimizedRepro, {
    original: reproScenario,
    replay: minimizedReplay,
    generatedAt: '2026-05-26T00:00:00.000Z',
    note: 'hardening fixture'
  });
  assert.strictEqual(artifact.kind, 'frontier-crdt-sync-model-repro');
  assert.strictEqual(artifact.version, 1);
  assert.strictEqual(artifact.replay.valid, false);
  assert.ok(artifact.summary.minimized.contentBytes < artifact.summary.original.contentBytes);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(artifact)).scenario, artifact.scenario);
}

async function testStorageContracts() {
  const source = createCrdtDocument({ actorId: 'storage-contract-source' });
  const updateA = source.set('/a', 1).update;
  const updateB = source.set('/b', 2).update;
  const updateObject = decodeCrdtUpdate(updateA);

  const storage = createCrdtMemoryStorageAdapter({ validateUpdates: true });
  await storage.appendUpdate('contract-doc', updateA);
  await assert.rejects(async () => {
    await storage.appendUpdate('contract-doc', new Uint8Array([1, 2, 3]));
  }, /valid JSON|Unexpected token/);
  assert.strictEqual((await storage.loadUpdates('contract-doc')).length, 1);

  await storage.replaceUpdates('contract-doc', []);
  const firstAppend = storage.appendUpdate('contract-doc', updateObject);
  const secondAppend = storage.appendUpdate('contract-doc', updateB);
  await Promise.all([firstAppend, secondAppend]);
  const stored = await storage.loadUpdates('contract-doc');
  assert.strictEqual(stored.length, 2);
  const replay = createCrdtDocument({ actorId: 'storage-contract-replay' });
  for (const update of stored) replay.applyUpdate(update);
  assert.deepStrictEqual(replay.toJSON(), { a: 1, b: 2 });

  await storage.replaceUpdates('contract-doc', [updateObject]);
  assert.strictEqual((await storage.loadUpdates('contract-doc')).length, 1);

  const handle = createCrdtDocHandle({
    documentId: 'compact-doc',
    peerId: 'compact-peer',
    actorId: 'compact-actor',
    storage
  });
  await handle.set('/ready', true);
  const compactedWithUpdate = await handle.compactStorage({ includeView: true, keepSnapshotUpdate: true });
  assert.strictEqual(compactedWithUpdate.afterUpdateCount, 1);
  const compactedSnapshotOnly = await handle.compactStorage({ includeView: true });
  assert.strictEqual(compactedSnapshotOnly.afterUpdateCount, 0);

  const looseStorage = createCrdtMemoryStorageAdapter();
  await looseStorage.appendUpdate('corrupt-doc', new Uint8Array([1, 2, 3]));
  const corruptHandle = createCrdtDocHandle({
    documentId: 'corrupt-doc',
    peerId: 'corrupt-peer',
    actorId: 'corrupt-actor',
    storage: looseStorage
  });
  await assert.rejects(() => corruptHandle.load(), /valid JSON|Unexpected token/);

  const repoStorage = createCrdtMemoryStorageAdapter({ validateUpdates: true });
  const repo = createCrdtRepo({ peerId: 'repo-peer', storage: repoStorage });
  const first = repo.create('repo-doc', { actorId: 'repo-actor-a' });
  const second = await repo.open('repo-doc', { actorId: 'repo-actor-b' });
  assert.strictEqual(first, second);
  await first.set('/ready', true);
  assert.strictEqual(repo.close('repo-doc'), true);
  assert.strictEqual(repo.close('repo-doc'), false);
  const reopened = await repo.open('repo-doc', { actorId: 'repo-actor-c' });
  assert.deepStrictEqual(reopened.toJSON(), { ready: true });
  await repo.delete('repo-doc');
  assert.strictEqual(repo.get('repo-doc'), undefined);
}

async function testStorageCompactionSchedules() {
  const documentId = 'compaction-schedule-doc';
  const storage = createCrdtMemoryStorageAdapter({ validateUpdates: true });
  const events = [];
  const unsubscribe = storage.subscribe((event) => {
    events.push({ type: event.type, documentId: event.documentId, updateCount: event.updateCount });
  });

  const handle = createCrdtDocHandle({
    documentId,
    peerId: 'compaction-peer-a',
    actorId: 'compaction-actor-a',
    storage
  });
  await handle.set('/items/a', { value: 1 });
  await handle.set('/items/b', { value: 2 });
  await handle.saveSnapshot({ includeView: true });
  assert.ok((await storage.loadUpdates(documentId)).length >= 2);

  const queuedC = createCrdtDocument({ actorId: 'compaction-queued-c' }).set('/queued/c', 3).update;
  const queuedD = createCrdtDocument({ actorId: 'compaction-queued-d' }).set('/queued/d', 4).update;
  const snapshot = handle.doc.snapshot({ includeView: true });
  await Promise.all([
    storage.appendUpdate(documentId, queuedC),
    storage.compact(documentId, snapshot, [queuedD]),
    storage.appendUpdate(documentId, queuedC)
  ]);

  const replay = createCrdtDocHandle({
    documentId,
    peerId: 'compaction-peer-b',
    actorId: 'compaction-actor-b',
    storage
  });
  await replay.load();
  assert.deepStrictEqual(replay.toJSON(), {
    items: {
      a: { value: 1 },
      b: { value: 2 }
    },
    queued: {
      c: 3,
      d: 4
    }
  });

  const compactedWithSnapshotUpdate = await replay.compactStorage({ includeView: true, keepSnapshotUpdate: true });
  assert.strictEqual(compactedWithSnapshotUpdate.afterUpdateCount, 1);
  const restoredFromSnapshotUpdate = createCrdtDocHandle({
    documentId,
    peerId: 'compaction-peer-c',
    actorId: 'compaction-actor-c',
    storage
  });
  await restoredFromSnapshotUpdate.load();
  assert.deepStrictEqual(restoredFromSnapshotUpdate.toJSON(), replay.toJSON());

  const compactedSnapshotOnly = await restoredFromSnapshotUpdate.compactStorage({ includeView: true });
  assert.strictEqual(compactedSnapshotOnly.afterUpdateCount, 0);
  const restoredSnapshotOnly = createCrdtDocHandle({
    documentId,
    peerId: 'compaction-peer-d',
    actorId: 'compaction-actor-d',
    storage
  });
  await restoredSnapshotOnly.load();
  assert.deepStrictEqual(restoredSnapshotOnly.toJSON(), replay.toJSON());
  assert.deepStrictEqual(await storage.listDocuments(), [documentId]);
  assert.ok(events.some((event) => event.type === 'append-update'));
  assert.ok(events.some((event) => event.type === 'snapshot'));
  assert.ok(events.some((event) => event.type === 'compact' && event.updateCount === 1));
  assert.ok(events.some((event) => event.type === 'compact' && event.updateCount === 0));
  unsubscribe();
}

async function testProviderRepoScenarios() {
  const documentId = 'provider-repo-doc';
  const peerIds = ['repo-net-a', 'repo-net-b', 'repo-net-c'];
  const network = createCrdtLocalSyncNetwork();
  const storages = peerIds.map(() => createCrdtMemoryStorageAdapter({ validateUpdates: true }));
  const events = [];
  const repos = peerIds.map((peerId, index) => createRepoProcess(peerId, index));
  const handles = [];

  for (let index = 0; index < repos.length; index++) {
    handles[index] = await repos[index].open(documentId, { actorId: `${peerIds[index]}-actor` });
    handles[index].provider.subscribe((event) => {
      events.push(`${peerIds[index]}:${event.type}`);
    });
  }
  await Promise.all(repos.map((repo) => repo.connectAll()));

  await handles[0].set('/title', 'draft');
  await handles[1].set('/participants/b', true);
  await syncRepos(repos);
  assertConvergedHandles(handles);

  const savedSyncState = repos[2].getSyncState();
  await repos[2].disconnectAll();
  await handles[0].set('/offline/a', 1);
  await handles[1].set('/offline/b', 2);
  await syncRepos([repos[0], repos[1]]);
  assert.notDeepStrictEqual(handles[2].toJSON(), handles[0].toJSON());

  await handles[2].saveSnapshot({ includeView: true });
  repos[2].close(documentId);
  repos[2] = createRepoProcess(peerIds[2], 2, savedSyncState);
  handles[2] = await repos[2].open(documentId, { actorId: `${peerIds[2]}-actor-restarted` });
  handles[2].provider.subscribe((event) => {
    events.push(`${peerIds[2]}-restarted:${event.type}`);
  });
  await repos[2].connectAll();
  await syncRepos(repos);
  assertConvergedHandles(handles);
  assert.deepStrictEqual(await repos[2].listStoredDocuments(), [documentId]);
  assert.ok(events.some((event) => event.endsWith(':send')));
  assert.ok(events.some((event) => event.endsWith(':receive')));

  await Promise.all(repos.map((repo) => repo.disconnectAll()));

  function createRepoProcess(peerId, index, syncState) {
    return createCrdtRepo({
      peerId,
      storage: storages[index],
      syncState,
      sync: {
        transport: network.connect(peerId),
        peers: peerIds.filter((candidate) => candidate !== peerId),
        encodeMessages: index !== 1,
        syncOnConnect: false
      }
    });
  }
}

async function testRollbackConvergenceFixtures() {
  const local = createCrdtDocument({ actorId: 'rollback-local' });
  const remote = createCrdtDocument({ actorId: 'rollback-remote' });
  const observer = createCrdtDocument({ actorId: 'rollback-observer' });
  const undo = createCrdtUndoManager(local, { trackedOrigins: ['typing', 'title'] });

  undo.capture(() => {
    local.text('/body').insert(0, 'abc');
  }, { origin: 'typing' });
  undo.capture(() => {
    local.set('/title', 'draft');
  }, { origin: 'title' });
  remote.applyUpdate(local.exportUpdate());
  observer.applyUpdate(local.exportUpdate());
  remote.set('/meta/remote', true);
  observer.set('/meta/observer', true);
  local.applyUpdate(remote.exportUpdate(local.getStateVector()));
  local.applyUpdate(observer.exportUpdate(local.getStateVector()));
  undo.undo({ origin: 'typing' });

  const convergedView = await convergeDocsThroughModel('rollback-converge-doc', [
    { id: 'rollback-local', doc: local },
    { id: 'rollback-remote', doc: remote },
    { id: 'rollback-observer', doc: observer }
  ]);
  assert.deepStrictEqual(convergedView, {
    title: 'draft',
    meta: {
      observer: true,
      remote: true
    }
  });

  const unsafeLocal = createCrdtDocument({ actorId: 'rollback-unsafe-local' });
  const unsafeRemote = createCrdtDocument({ actorId: 'rollback-unsafe-remote' });
  const unsafeUndo = createCrdtUndoManager(unsafeLocal);
  unsafeUndo.capture(() => {
    unsafeLocal.text('/body').insert(0, 'abc');
  });
  unsafeRemote.applyUpdate(unsafeLocal.exportUpdate());
  unsafeRemote.text('/body').insert(0, 'X');
  unsafeLocal.applyUpdate(unsafeRemote.exportUpdate(unsafeLocal.getStateVector()));
  assert.throws(() => unsafeUndo.undo(), /overlapping path/);

  const unsafeConvergedView = await convergeDocsThroughModel('rollback-refusal-doc', [
    { id: 'rollback-refusal-local', doc: unsafeLocal },
    { id: 'rollback-refusal-remote', doc: unsafeRemote }
  ]);
  assert.deepStrictEqual(unsafeConvergedView, { body: 'Xabc' });
}

async function testDeterministicSoak(cases, steps) {
  for (let caseIndex = 0; caseIndex < cases; caseIndex++) {
    const model = createModelNetwork(3 + randInt(2), `soak-doc-${caseIndex}`, `soak-${caseIndex}`);
    for (let step = 0; step < steps; step++) {
      const choice = randInt(12);
      if (choice < 4) {
        mutate(model.peers[randInt(model.peers.length)].doc, caseIndex, step);
      } else if (choice < 6) {
        model.sendOpen(randInt(model.peers.length), randInt(model.peers.length));
      } else if (choice === 6) {
        model.checker.duplicateNext(1 + randInt(2));
      } else if (choice === 7) {
        model.checker.dropNext(1);
      } else if (choice === 8) {
        const left = randInt(model.peers.length);
        let right = randInt(model.peers.length);
        if (right === left) right = (right + 1) % model.peers.length;
        model.checker.partition(model.peers[left].id, model.peers[right].id);
      } else if (choice === 9) {
        model.checker.heal();
      } else if (choice === 10) {
        const peer = model.peers[randInt(model.peers.length)];
        model.checker.disconnect(peer.id);
        if (randInt(3) !== 0) model.attach(peer);
      } else {
        const queued = model.checker.queueSnapshot();
        if (queued.length !== 0) await model.checker.deliver(queued[randInt(queued.length)].id);
      }
      if (randInt(4) === 0) await model.checker.deliverNext();
    }
    model.checker.heal();
    for (const peer of model.peers) {
      if (!model.checker.getPeerIds().includes(peer.id)) model.attach(peer);
    }
    await model.syncAll(model.peers.length + 3);
    const result = await model.checker.drain({ maxSteps: 3000 });
    assert.strictEqual(result.valid, true, JSON.stringify({ caseIndex, errors: result.errors, pending: result.pending }));
    const convergence = checkCrdtSyncConvergence(model.peers.map((peer) => ({ peerId: peer.id, doc: peer.doc })));
    assert.strictEqual(convergence.valid, true, JSON.stringify({ caseIndex, mismatches: convergence.mismatches }));
  }
}

function createModelNetwork(peerCount, documentId, prefix) {
  const checker = createCrdtSyncModelChecker();
  let wireCounter = 0;
  const peers = [];
  const maybeWire = (message) => {
    wireCounter++;
    return wireCounter % 2 === 0 ? encodeCrdtSyncMessage(message) : message;
  };
  const model = {
    checker,
    peers,
    attach(peer) {
      peer.transport = checker.connect(peer.id, async (message, fromPeerId) => {
        const reply = peer.endpoint.receive(fromPeerId, message);
        if (reply !== undefined) peer.transport.send(fromPeerId, maybeWire(reply));
      });
      return peer.transport;
    },
    sendOpen(fromIndex, toIndex) {
      if (fromIndex === toIndex) return;
      const from = peers[fromIndex];
      const to = peers[toIndex];
      from.transport.send(to.id, maybeWire(from.endpoint.open(to.id)));
    },
    async syncAll(rounds) {
      for (let round = 0; round < rounds; round++) {
        for (let left = 0; left < peers.length; left++) {
          for (let right = 0; right < peers.length; right++) {
            if (left !== right) this.sendOpen(left, right);
          }
        }
        await checker.drain({ maxSteps: 2000 });
      }
    }
  };
  for (let i = 0; i < peerCount; i++) {
    const id = `${prefix}-${i}`;
    const doc = createCrdtDocument({ actorId: `${prefix}-actor-${i}` });
    const peer = {
      id,
      doc,
      endpoint: createCrdtSyncEndpoint(doc, {
        documentId,
        senderId: id,
        actorRangeSync: true
      }),
      transport: undefined
    };
    peers.push(peer);
    model.attach(peer);
  }
  return model;
}

async function syncRepos(repos, rounds = 4) {
  for (let round = 0; round < rounds; round++) {
    for (let index = 0; index < repos.length; index++) await repos[index].syncAll();
  }
}

function assertConvergedHandles(handles) {
  const convergence = checkCrdtSyncConvergence(handles.map((handle, index) => ({
    peerId: handle.peerId ?? `handle-${index}`,
    view: handle.toJSON(),
    stateVector: handle.doc.getStateVector()
  })));
  assert.strictEqual(convergence.valid, true, JSON.stringify(convergence.mismatches));
}

async function convergeDocsThroughModel(documentId, docs) {
  const checker = createCrdtSyncModelChecker();
  let wireCounter = 0;
  const peers = docs.map(({ id, doc }) => ({
    id,
    doc,
    endpoint: createCrdtSyncEndpoint(doc, {
      documentId,
      senderId: id,
      actorRangeSync: true
    }),
    transport: undefined
  }));
  const maybeWire = (message) => {
    wireCounter++;
    return wireCounter % 2 === 0 ? encodeCrdtSyncMessage(message) : message;
  };
  for (const peer of peers) {
    peer.transport = checker.connect(peer.id, async (message, fromPeerId) => {
      const reply = peer.endpoint.receive(fromPeerId, message);
      if (reply !== undefined) peer.transport.send(fromPeerId, maybeWire(reply));
    });
  }
  for (let round = 0; round < peers.length + 3; round++) {
    for (let left = 0; left < peers.length; left++) {
      for (let right = 0; right < peers.length; right++) {
        if (left !== right) peers[left].transport.send(peers[right].id, maybeWire(peers[left].endpoint.open(peers[right].id)));
      }
    }
    const result = await checker.drain({ maxSteps: 2000 });
    assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
  }
  const convergence = checkCrdtSyncConvergence(peers.map((peer) => ({ peerId: peer.id, doc: peer.doc })));
  assert.strictEqual(convergence.valid, true, JSON.stringify(convergence.mismatches));
  return peers[0].doc.toJSON();
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
      doc.text('/body').insert(randInt(text.length + 1), String.fromCharCode(97 + randInt(26)));
      break;
    }
    case 3: {
      const text = typeof view.body === 'string' ? view.body : '';
      if (text.length !== 0) doc.text('/body').delete(randInt(text.length), 1);
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
      if (list.length !== 0) doc.list('/list').delete(randInt(list.length), 1);
      break;
    }
  }
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
    if (arg === '--soak-cases') out.soakCases = argv[++i];
    else if (arg === '--soak-steps') out.soakSteps = argv[++i];
    else if (arg === '--seed') out.seed = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node test/hardening.mjs [--soak-cases 24] [--soak-steps 40] [--seed number]');
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
