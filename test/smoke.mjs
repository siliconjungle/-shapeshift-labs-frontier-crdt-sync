import assert from 'node:assert';

const sync = await import('../dist/index.js');
const syncCore = await import('../dist/sync.js');
const syncRepo = await import('../dist/repo.js');
const syncStorage = await import('../dist/storage.js');
const syncProvider = await import('../dist/provider.js');
const syncLazyBody = await import('../dist/lazy-body.js');
const syncModel = await import('../dist/model.js');
const syncForensics = await import('../dist/forensics.js');
const syncTextBinding = await import('../dist/text-binding.js');
const crdt = await import('@shapeshift-labs/frontier-crdt');

for (const name of [
  'createCrdtSyncState',
  'createCrdtSyncEndpoint',
  'createCrdtSyncProvider',
  'scheduleCrdtSync',
  'createCrdtDocHandle',
  'createCrdtRepo',
  'createCrdtLocalSyncNetwork',
  'createCrdtSyncModelChecker',
  'checkCrdtSyncConvergence',
  'createCrdtSyncGhostState',
  'createCrdtTextBinding',
  'createCrdtDocumentUrl',
  'parseCrdtDocumentUrl',
  'createCrdtMemoryStorageAdapter',
  'compactCrdtStorage',
  'encodeCrdtSyncMessage',
  'decodeCrdtSyncMessage',
  'diffCrdtSyncActorRanges',
  'unionCrdtSyncActorRanges'
]) {
  assert.strictEqual(typeof sync[name], 'function', name + ' should be exported');
}

assert.strictEqual(sync.createLogger, undefined);
assert.strictEqual(sync.createStateEngine, undefined);
assert.deepStrictEqual(Object.keys(syncCore).sort(), [
  'createCrdtDocumentUrl',
  'createCrdtSyncEndpoint',
  'createCrdtSyncGhostState',
  'createCrdtSyncState',
  'decodeCrdtSyncMessage',
  'diffCrdtSyncActorRanges',
  'encodeCrdtSyncMessage',
  'parseCrdtDocumentUrl',
  'unionCrdtSyncActorRanges'
]);
assert.deepStrictEqual(Object.keys(syncRepo).sort(), [
  'createCrdtDocHandle',
  'createCrdtDocumentUrl',
  'createCrdtRepo',
  'parseCrdtDocumentUrl'
]);
assert.deepStrictEqual(Object.keys(syncStorage).sort(), [
  'compactCrdtStorage',
  'createCrdtMemoryStorageAdapter'
]);
assert.deepStrictEqual(Object.keys(syncProvider).sort(), [
  'createCrdtLocalSyncNetwork',
  'createCrdtSyncProvider',
  'scheduleCrdtSync'
]);
assert.deepStrictEqual(Object.keys(syncLazyBody).sort(), [
  'createCrdtSyncLazyBodyStore',
  'createCrdtSyncLazyUpdateMessage',
  'hashCrdtSyncLazyBody',
  'hydrateCrdtSyncLazyUpdateMessage'
]);
assert.deepStrictEqual(Object.keys(syncModel).sort(), [
  'checkCrdtSyncConvergence',
  'createCrdtSyncModelChecker',
  'createCrdtSyncModelReproArtifact',
  'minimizeCrdtSyncModelReproScenario',
  'minimizeCrdtSyncModelSchedule',
  'replayCrdtSyncModelReproScenario',
  'replayCrdtSyncModelSchedule',
  'summarizeCrdtSyncModelReproScenario'
]);
assert.deepStrictEqual(Object.keys(syncForensics).sort(), [
  'createCrdtSyncReplayArtifact',
  'createCrdtSyncReplayArtifactStore'
]);
assert.deepStrictEqual(Object.keys(syncForensics).sort(), [
  'createCrdtSyncReplayArtifact',
  'createCrdtSyncReplayArtifactStore'
]);
assert.deepStrictEqual(Object.keys(syncTextBinding).sort(), [
  'createCrdtTextBinding'
]);

const url = sync.createCrdtDocumentUrl('doc-a', { peerId: 'alice', params: { room: 'test' } });
assert.deepStrictEqual(sync.parseCrdtDocumentUrl(url), {
  documentId: 'doc-a',
  peerId: 'alice',
  params: { room: 'test' }
});

const alice = crdt.createCrdtDocument({ actorId: 'sync-alice' });
const bob = crdt.createCrdtDocument({ actorId: 'sync-bob' });
alice.set('/title', 'hello');

const aliceEndpoint = sync.createCrdtSyncEndpoint(alice, { documentId: 'doc-a', senderId: 'alice' });
const bobEndpoint = sync.createCrdtSyncEndpoint(bob, { documentId: 'doc-a', senderId: 'bob' });
const open = bobEndpoint.open('alice');
const update = aliceEndpoint.receive('bob', open);
assert.ok(update);
const encoded = sync.encodeCrdtSyncMessage(update);
const decoded = sync.decodeCrdtSyncMessage(encoded);
assert.strictEqual(decoded.type, 'update');
const ack = bobEndpoint.receive('alice', decoded);
assert.deepStrictEqual(bob.toJSON(), { title: 'hello' });
assert.strictEqual(ack?.type, 'ack');

const lazySource = crdt.createCrdtDocument({ actorId: 'sync-lazy-source' });
const lazyPeer = crdt.createCrdtDocument({ actorId: 'sync-lazy-peer' });
lazySource.set('/blob', 'x'.repeat(8192));
const lazySourceEndpoint = sync.createCrdtSyncEndpoint(lazySource, { documentId: 'lazy-doc', senderId: 'source' });
const lazyPeerEndpoint = sync.createCrdtSyncEndpoint(lazyPeer, { documentId: 'lazy-doc', senderId: 'peer' });
const eagerLazyUpdate = lazySourceEndpoint.receive('peer', lazyPeerEndpoint.open('source'));
assert.strictEqual(eagerLazyUpdate?.type, 'update');
const lazyBodyStore = syncLazyBody.createCrdtSyncLazyBodyStore();
const eagerLazyBytes = sync.encodeCrdtSyncMessage(eagerLazyUpdate).byteLength;
const lazyAdvert = syncLazyBody.createCrdtSyncLazyUpdateMessage(eagerLazyUpdate, lazyBodyStore, { thresholdBytes: 1 });
assert.strictEqual(lazyAdvert.update, undefined);
assert.strictEqual(lazyAdvert.updateBody?.kind, 'crdt-update');
assert.strictEqual(lazyAdvert.updateBody.hash, syncLazyBody.hashCrdtSyncLazyBody(eagerLazyUpdate.update));
assert.deepStrictEqual(lazyAdvert.updateBody.stateVector, lazySource.getStateVector());
assert.ok(lazyAdvert.updateBody.actorRanges.length > 0);
const lazyAdvertBytes = sync.encodeCrdtSyncMessage(lazyAdvert).byteLength;
assert.ok(lazyAdvertBytes < eagerLazyBytes);
const hydratedLazy = syncLazyBody.hydrateCrdtSyncLazyUpdateMessage(sync.decodeCrdtSyncMessage(sync.encodeCrdtSyncMessage(lazyAdvert)), lazyBodyStore);
assert.ok(hydratedLazy.update instanceof Uint8Array);
lazyPeerEndpoint.receive('source', hydratedLazy);
assert.deepStrictEqual(lazyPeer.toJSON(), lazySource.toJSON());
assert.strictEqual(lazyBodyStore.getStats().hits, 1);
assert.throws(
  () => syncLazyBody.hydrateCrdtSyncLazyUpdateMessage(lazyAdvert, syncLazyBody.createCrdtSyncLazyBodyStore()),
  /lazy update body is missing/
);

const lazyNetwork = sync.createCrdtLocalSyncNetwork();
const lazySharedBodyStore = syncLazyBody.createCrdtSyncLazyBodyStore();
const lazyProviderSourceDoc = crdt.createCrdtDocument({ actorId: 'sync-lazy-provider-source' });
const lazyProviderPeerDoc = crdt.createCrdtDocument({ actorId: 'sync-lazy-provider-peer' });
lazyProviderSourceDoc.set('/blob', 'y'.repeat(8192));
const lazyProviderSource = sync.createCrdtSyncProvider(
  sync.createCrdtSyncEndpoint(lazyProviderSourceDoc, { documentId: 'lazy-provider-doc', senderId: 'source' }),
  {
    transport: lazyNetwork.connect('source'),
    peers: ['peer'],
    lazyBodies: { store: lazySharedBodyStore, thresholdBytes: 1 }
  }
);
const lazyProviderPeer = sync.createCrdtSyncProvider(
  sync.createCrdtSyncEndpoint(lazyProviderPeerDoc, { documentId: 'lazy-provider-doc', senderId: 'peer' }),
  {
    transport: lazyNetwork.connect('peer'),
    peers: ['source'],
    lazyBodies: { store: lazySharedBodyStore, thresholdBytes: 1 }
  }
);
const lazyProviderEvents = [];
lazyProviderSource.subscribe((event) => {
  if (event.type === 'send' && event.message?.updateBody !== undefined) lazyProviderEvents.push(event.message);
});
await lazyProviderSource.connect();
await lazyProviderPeer.connect();
await lazyProviderPeer.sync('source');
assert.deepStrictEqual(lazyProviderPeerDoc.toJSON(), lazyProviderSourceDoc.toJSON());
assert.ok(lazyProviderEvents.some((message) => message.update === undefined && message.updateBody?.byteLength > 0));
await lazyProviderSource.disconnect();
await lazyProviderPeer.disconnect();

const scheduledSyncNetwork = sync.createCrdtLocalSyncNetwork();
const scheduledSourceDoc = crdt.createCrdtDocument({ actorId: 'sync-scheduled-source' });
const scheduledPeerDoc = crdt.createCrdtDocument({ actorId: 'sync-scheduled-peer' });
scheduledSourceDoc.set('/queued', true);
const scheduledSource = sync.createCrdtSyncProvider(
  sync.createCrdtSyncEndpoint(scheduledSourceDoc, { documentId: 'scheduled-doc', senderId: 'source' }),
  {
    transport: scheduledSyncNetwork.connect('source'),
    peers: ['peer']
  }
);
const scheduledPeer = sync.createCrdtSyncProvider(
  sync.createCrdtSyncEndpoint(scheduledPeerDoc, { documentId: 'scheduled-doc', senderId: 'peer' }),
  {
    transport: scheduledSyncNetwork.connect('peer'),
    peers: ['source']
  }
);
const scheduledTasks = [];
const scheduledSyncScheduler = {
  schedule(task) {
    scheduledTasks.push(task);
    return task;
  },
  run(options = {}) {
    const lane = options.lane;
    for (let i = 0; i < scheduledTasks.length; i++) {
      const task = scheduledTasks[i];
      if (lane !== undefined && task.lane !== lane) continue;
      scheduledTasks.splice(i, 1);
      i--;
      void task.run();
    }
  }
};
await scheduledSource.connect();
await scheduledPeer.connect();
sync.scheduleCrdtSync(scheduledPeer, { scheduler: scheduledSyncScheduler, lane: 'sync', peerId: 'source' });
assert.strictEqual(scheduledTasks[0].type, 'frontier.crdt-sync.sync');
scheduledSyncScheduler.run({ lane: 'sync' });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepStrictEqual(scheduledPeerDoc.toJSON(), scheduledSourceDoc.toJSON());
await scheduledSource.disconnect();
await scheduledPeer.disconnect();

const sparseSource = crdt.createCrdtDocument({ actorId: 'sync-sparse-source' });
const sparseUpdates = [];
for (let i = 0; i < 16; i++) sparseUpdates.push(sparseSource.set('/items/k' + i, { i }).update);
const sparsePeer = crdt.createCrdtDocument({ actorId: 'sync-sparse-peer' });
for (let i = 0; i < sparseUpdates.length; i++) {
  if (i !== 6) sparsePeer.applyUpdate(sparseUpdates[i]);
}
const sparseSourceEndpoint = sync.createCrdtSyncEndpoint(sparseSource, {
  documentId: 'sparse-doc',
  senderId: 'source',
  actorRangeSync: true
});
const sparsePeerEndpoint = sync.createCrdtSyncEndpoint(sparsePeer, {
  documentId: 'sparse-doc',
  senderId: 'peer',
  actorRangeSync: true
});
const sparseOpen = sparsePeerEndpoint.open('source');
assert.ok(sparseOpen.actorRanges?.length > 1);
const sparseRangeUpdate = sparseSourceEndpoint.receive('peer', sync.encodeCrdtSyncMessage(sparseOpen));
assert.strictEqual(sparseRangeUpdate?.type, 'update');
assert.ok(sparseRangeUpdate.update.byteLength < sparseSource.exportUpdate(sparsePeer.getStateVector()).byteLength);
sparsePeerEndpoint.receive('source', sync.encodeCrdtSyncMessage(sparseRangeUpdate));
assert.deepStrictEqual(sparsePeer.toJSON(), sparseSource.toJSON());

const tieredSource = crdt.createCrdtDocument({ actorId: 'sync-tiered-source' });
const tieredUpdates = [];
for (let i = 0; i < 512; i++) tieredUpdates.push(tieredSource.set('/items/k' + i, { i }).update);
const tieredPeer = crdt.createCrdtDocument({ actorId: 'sync-tiered-peer' });
for (let i = 0; i < tieredUpdates.length; i++) {
  if (i % 16 !== 8) tieredPeer.applyUpdate(tieredUpdates[i]);
}
const tieredSourceEndpoint = sync.createCrdtSyncEndpoint(tieredSource, {
  documentId: 'tiered-doc',
  senderId: 'source',
  actorRangeSync: true
});
const tieredPeerEndpoint = sync.createCrdtSyncEndpoint(tieredPeer, {
  documentId: 'tiered-doc',
  senderId: 'peer',
  actorRangeSync: true
});
const tieredOpen = tieredPeerEndpoint.open('source');
assert.strictEqual(tieredOpen.actorRanges, undefined);
assert.strictEqual(tieredOpen.reconciliation?.strategy, 'merkle-iblt');
assert.ok(tieredOpen.reconciliation.cells.length <= 128);
assert.ok(tieredOpen.reconciliation.rangeCount > 32);
const tieredRangeUpdate = tieredSourceEndpoint.receive('peer', sync.encodeCrdtSyncMessage(tieredOpen));
assert.strictEqual(tieredRangeUpdate?.type, 'update');
assert.ok(tieredRangeUpdate.update.byteLength < tieredSource.exportUpdate(tieredPeer.getStateVector()).byteLength);
tieredPeerEndpoint.receive('source', sync.encodeCrdtSyncMessage(tieredRangeUpdate));
assert.deepStrictEqual(tieredPeer.toJSON(), tieredSource.toJSON());

const tieredTextSource = crdt.createCrdtDocument({ actorId: 'sync-tiered-text-source' });
const tieredTextUpdates = [];
for (let i = 0; i < 192; i++) {
  tieredTextUpdates.push(tieredTextSource.text('/body').insert(i, String.fromCharCode(65 + (i % 26))).update);
}
const tieredTextPeer = crdt.createCrdtDocument({ actorId: 'sync-tiered-text-peer' });
for (let i = 0; i < tieredTextUpdates.length; i++) {
  if (i % 5 !== 2) tieredTextPeer.applyUpdate(tieredTextUpdates[i]);
}
const tieredTextSourceEndpoint = sync.createCrdtSyncEndpoint(tieredTextSource, {
  documentId: 'tiered-text-doc',
  senderId: 'source',
  actorRangeSync: true
});
const tieredTextPeerEndpoint = sync.createCrdtSyncEndpoint(tieredTextPeer, {
  documentId: 'tiered-text-doc',
  senderId: 'peer',
  actorRangeSync: true
});
const tieredTextOpen = tieredTextPeerEndpoint.open('source');
assert.strictEqual(tieredTextOpen.actorRanges, undefined);
assert.strictEqual(tieredTextOpen.reconciliation?.strategy, 'merkle-iblt');
const tieredTextUpdate = tieredTextSourceEndpoint.receive('peer', sync.encodeCrdtSyncMessage(tieredTextOpen));
assert.strictEqual(tieredTextUpdate?.type, 'update');
tieredTextPeerEndpoint.receive('source', sync.encodeCrdtSyncMessage(tieredTextUpdate));
assert.deepStrictEqual(tieredTextPeer.toJSON(), tieredTextSource.toJSON());

assert.deepStrictEqual(sync.unionCrdtSyncActorRanges(
  [{ actor: 'ghost-a', start: 1, end: 3 }],
  [{ actor: 'ghost-a', start: 4, end: 8 }, { actor: 'ghost-b', start: 2, end: 2 }]
), [
  { actor: 'ghost-a', start: 1, end: 8 },
  { actor: 'ghost-b', start: 2, end: 2 }
]);
assert.deepStrictEqual(sync.diffCrdtSyncActorRanges(
  [{ actor: 'ghost-a', start: 1, end: 8 }],
  [{ actor: 'ghost-a', start: 2, end: 3 }, { actor: 'ghost-a', start: 6, end: 7 }]
), [
  { actor: 'ghost-a', start: 1, end: 1 },
  { actor: 'ghost-a', start: 4, end: 5 },
  { actor: 'ghost-a', start: 8, end: 8 }
]);

const ghostSource = crdt.createCrdtDocument({ actorId: 'sync-ghost-source' });
const ghostClient = crdt.createCrdtDocument({ actorId: 'sync-ghost-client' });
const ghost = sync.createCrdtSyncGhostState();
let droppedBytes = 0;
for (let frame = 0; frame < 4; frame++) {
  for (let row = 0; row < 4; row++) {
    ghostSource.set('/entities/e' + frame + '-' + row, { frame, row });
  }
  const delta = ghost.createDelta(ghostSource);
  assert.ok(delta);
  if (frame === 0) {
    ghostClient.applyUpdate(delta.update);
    ghost.markAcked(delta.ranges);
  } else {
    droppedBytes += delta.update.byteLength;
  }
}
assert.deepStrictEqual(ghost.getAckedActorRanges(), [
  { actor: 'sync-ghost-source', start: 1, end: 4 }
]);
assert.deepStrictEqual(ghost.getPendingActorRanges(), [
  { actor: 'sync-ghost-source', start: 5, end: 16 }
]);
const ghostRepair = ghost.createRepairDelta(ghostSource);
assert.ok(ghostRepair);
assert.deepStrictEqual(ghostRepair.basisRanges, [
  { actor: 'sync-ghost-source', start: 1, end: 4 }
]);
assert.deepStrictEqual(ghostRepair.ranges, [
  { actor: 'sync-ghost-source', start: 5, end: 16 }
]);
assert.ok(ghostRepair.update.byteLength < droppedBytes);
ghostClient.applyUpdate(ghostRepair.update);
ghost.markAcked();
assert.deepStrictEqual(ghost.getPendingActorRanges(), []);
assert.deepStrictEqual(ghostClient.toJSON(), ghostSource.toJSON());

const storage = sync.createCrdtMemoryStorageAdapter();
const handle = sync.createCrdtDocHandle({
  documentId: 'stored-doc',
  peerId: 'alice',
  actorId: 'sync-handle',
  storage
});
await handle.set('/count', 1);
await handle.saveSnapshot({ includeView: true });
const storedUpdates = await storage.loadUpdates('stored-doc');
assert.strictEqual(storedUpdates.length, 1);
const compacted = await sync.compactCrdtStorage(handle, { includeView: true });
assert.strictEqual(compacted.documentId, 'stored-doc');

const repo = sync.createCrdtRepo({ peerId: 'repo-peer', storage });
const repoHandle = repo.create('repo-doc', { actorId: 'repo-actor' });
await repoHandle.set('/ready', true);
assert.strictEqual(repo.get('repo-doc'), repoHandle);

const network = sync.createCrdtLocalSyncNetwork();
const messages = [];
const disconnect = network.connect('peer-a', (message, peerId) => {
  messages.push([peerId, message.type]);
});
await network.connect('peer-b').send('peer-a', { type: 'ack', stateVector: {} });
assert.deepStrictEqual(messages, [['peer-b', 'ack']]);
disconnect.disconnect?.();

const checker = sync.createCrdtSyncModelChecker();
assert.deepStrictEqual(checker.getPeerIds(), []);
assert.strictEqual(sync.checkCrdtSyncConvergence([alice, bob]).valid, true);

const artifactStore = syncForensics.createCrdtSyncReplayArtifactStore({ now: () => 1 });
const artifact = artifactStore.append([
  { type: 'connect', peerId: 'alice' },
  { type: 'connect', peerId: 'bob' },
  { type: 'drain', maxSteps: 4 }
], {
  minimized: true,
  result: await checker.drain({ maxSteps: 0 }),
  metadata: { source: 'smoke' }
});
assert.strictEqual(artifact.kind, 'crdt-sync-replay');
assert.strictEqual(artifact.seq, 1);
assert.strictEqual(artifact.minimized, true);
assert.deepStrictEqual(artifactStore.read({ sinceSeq: 0 }).map((entry) => entry.id), [artifact.id]);
artifactStore.checkpoint();
assert.strictEqual(artifactStore.getStats().log.records, 0);

const adapter = {
  value: '',
  listeners: [],
  getText() {
    return this.value;
  },
  replaceText(index, deleteCount, text) {
    this.value = this.value.slice(0, index) + text + this.value.slice(index + deleteCount);
  },
  onChange(listener) {
    this.listeners.push(listener);
    return () => {};
  }
};
const binding = sync.createCrdtTextBinding(handle, '/body', adapter, { initialSync: 'doc-to-editor' });
assert.strictEqual(binding.isStarted(), false);
await binding.start();
assert.strictEqual(binding.isStarted(), true);
binding.stop();
assert.strictEqual(binding.isStarted(), false);
