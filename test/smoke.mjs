import assert from 'node:assert';

const sync = await import('../dist/index.js');
const syncCore = await import('../dist/sync.js');
const syncRepo = await import('../dist/repo.js');
const syncStorage = await import('../dist/storage.js');
const syncProvider = await import('../dist/provider.js');
const syncModel = await import('../dist/model.js');
const syncForensics = await import('../dist/forensics.js');
const syncTextBinding = await import('../dist/text-binding.js');
const crdt = await import('@shapeshift-labs/frontier-crdt');

for (const name of [
  'createCrdtSyncState',
  'createCrdtSyncEndpoint',
  'createCrdtSyncProvider',
  'createCrdtDocHandle',
  'createCrdtRepo',
  'createCrdtLocalSyncNetwork',
  'createCrdtSyncModelChecker',
  'checkCrdtSyncConvergence',
  'createCrdtTextBinding',
  'createCrdtDocumentUrl',
  'parseCrdtDocumentUrl',
  'createCrdtMemoryStorageAdapter',
  'compactCrdtStorage',
  'encodeCrdtSyncMessage',
  'decodeCrdtSyncMessage'
]) {
  assert.strictEqual(typeof sync[name], 'function', name + ' should be exported');
}

assert.strictEqual(sync.createLogger, undefined);
assert.strictEqual(sync.createStateEngine, undefined);
assert.deepStrictEqual(Object.keys(syncCore).sort(), [
  'createCrdtDocumentUrl',
  'createCrdtSyncEndpoint',
  'createCrdtSyncState',
  'decodeCrdtSyncMessage',
  'encodeCrdtSyncMessage',
  'parseCrdtDocumentUrl'
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
  'createCrdtSyncProvider'
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
