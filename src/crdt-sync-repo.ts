import { createCrdtDocument } from '@shapeshift-labs/frontier-crdt/document';
import {
  inspectCrdtUpdate,
  mergeCrdtUpdates
} from '@shapeshift-labs/frontier-crdt/update';
import {
  assertDocumentId,
  cloneCrdtSyncPeerStates,
  createCrdtDocumentUrl,
  decodeCrdtSyncMessage,
  parseCrdtDocumentUrl,
  stateVectorHasChanges
} from './crdt-sync-wire.js';
import { createCrdtSyncProvider } from './crdt-sync-provider.js';
import {
  createCrdtSyncEndpoint
} from './crdt-sync-state.js';
import {
  compactCrdtStorage
} from './crdt-sync-storage.js';
import {
  cloneCrdtSnapshot
} from './crdt-sync-storage-utils.js';
import type {
  CrdtCommitResult,
  CrdtChangeOptions,
  CrdtDocHandle,
  CrdtDocHandleOptions,
  CrdtDocHandleUpdate,
  CrdtDocHandleUpdateListener,
  CrdtDocumentUrlParts,
  CrdtDocument,
  CrdtRepo,
  CrdtRepoEvent,
  CrdtRepoEventListener,
  CrdtRepoOpenOptions,
  CrdtRepoOptions,
  CrdtRepoSyncState,
  CrdtSnapshotOptions,
  CrdtSnapshot,
  CrdtStorageCompactionOptions,
  CrdtStorageCompactionResult,
  CrdtStorageAdapter,
  CrdtSyncProvider,
  CrdtSyncProviderOptions,
  CrdtSyncEndpoint,
  CrdtSyncMessage,
  CrdtSyncMessageInput,
  CrdtSyncPeerStates,
  CrdtUpdateInput,
  JsonValue,
  WatchPath
} from './types.js';

export {
  createCrdtDocumentUrl,
  parseCrdtDocumentUrl
};

export function createCrdtDocHandle(options: CrdtDocHandleOptions): CrdtDocHandle {
  return new FrontierCrdtDocHandle(options);
}

export function createCrdtRepo(options?: CrdtRepoOptions): CrdtRepo {
  return new FrontierCrdtRepo(options);
}

class FrontierCrdtDocHandle implements CrdtDocHandle {
  readonly documentId: string;
  readonly peerId?: string;
  readonly url: string;
  readonly doc: CrdtDocument;
  readonly endpoint: CrdtSyncEndpoint;
  readonly storage?: CrdtStorageAdapter;
  readonly provider?: CrdtSyncProvider;
  private readonly listeners = new Set<CrdtDocHandleUpdateListener>();

  constructor(options: CrdtDocHandleOptions) {
    assertDocumentId(options.documentId);
    this.documentId = options.documentId;
    this.peerId = options.peerId;
    this.url = createCrdtDocumentUrl(options.documentId, { peerId: options.peerId });
    this.doc = options.doc ?? createCrdtDocument(options);
    this.storage = options.storage;
    this.endpoint = createCrdtSyncEndpoint(this.doc, {
      documentId: this.documentId,
      senderId: this.peerId
    });
    if (options.sync) this.provider = createCrdtSyncProvider(this.endpoint, options.sync);
  }

  toJSON(): JsonValue {
    return this.doc.toJSON();
  }

  subscribe(listener: CrdtDocHandleUpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async change(callback: Parameters<CrdtDocument['change']>[0], options?: CrdtChangeOptions): Promise<CrdtCommitResult> {
    return this.recordLocalUpdate(this.doc.change(callback, options));
  }

  async set(path: WatchPath, value: JsonValue): Promise<CrdtCommitResult> {
    return this.recordLocalUpdate(this.doc.set(path, value));
  }

  async delete(path: WatchPath): Promise<CrdtCommitResult> {
    return this.recordLocalUpdate(this.doc.delete(path));
  }

  async recordLocalUpdate(result: CrdtCommitResult): Promise<CrdtCommitResult> {
    await this.persistAndEmit('local', result);
    return result;
  }

  async applyUpdate(update: CrdtUpdateInput, peerId?: string): Promise<CrdtCommitResult> {
    const before = this.doc.getStateVector();
    const result = this.doc.applyUpdate(update);
    if (stateVectorHasChanges(result.stateVector, before)) {
      await this.persistAndEmit('remote', result, peerId);
    }
    return result;
  }

  async receiveSyncMessage(message: CrdtSyncMessageInput, peerId?: string): Promise<CrdtSyncMessage | undefined> {
    const decoded = decodeCrdtSyncMessage(message);
    const resolvedPeerId = peerId ?? decoded.senderId;
    if (resolvedPeerId === undefined) throw new TypeError('CRDT sync message is missing senderId');
    if (this.endpoint.documentId !== undefined && decoded.documentId !== undefined && decoded.documentId !== this.endpoint.documentId) {
      throw new TypeError('CRDT sync message belongs to a different document');
    }
    const syncState = this.endpoint.getPeerState(resolvedPeerId);
    if (decoded.type === 'state-vector') {
      syncState.setStateVector(decoded.stateVector);
      return syncState.hasChanges(this.doc)
        ? syncState.createUpdateMessage(this.doc)
        : syncState.createAckMessage(this.doc);
    }
    if (decoded.type === 'update') {
      if (decoded.update === undefined) throw new TypeError('CRDT sync update message is missing update bytes');
      const before = this.doc.getStateVector();
      const result = this.doc.applyUpdate(decoded.update);
      syncState.markUpdateKnown(decoded.update);
      syncState.updateStateVector(decoded.stateVector);
      if (stateVectorHasChanges(result.stateVector, before)) {
        await this.persistAndEmit('remote', result, resolvedPeerId);
      }
      return syncState.hasChanges(this.doc)
        ? syncState.createUpdateMessage(this.doc)
        : syncState.createAckMessage(this.doc);
    }
    syncState.updateStateVector(decoded.stateVector);
    return syncState.hasChanges(this.doc) ? syncState.createUpdateMessage(this.doc) : undefined;
  }

  async load(): Promise<CrdtCommitResult | undefined> {
    if (this.storage === undefined) return undefined;
    let latest: CrdtCommitResult | undefined;
    const snapshot = await this.storage.loadSnapshot(this.documentId);
    if (snapshot !== undefined) {
      const before = this.doc.getStateVector();
      const result = this.doc.applySnapshot(snapshot);
      if (stateVectorHasChanges(result.stateVector, before)) {
        this.emit('storage', result);
        latest = result;
      }
    }
    const stateVector = this.doc.getStateVector();
    const update = this.storage.loadMergedUpdate === undefined
      ? mergeCrdtUpdates(await this.storage.loadUpdates(this.documentId, stateVector))
      : await this.storage.loadMergedUpdate(this.documentId, stateVector);
    if (inspectCrdtUpdate(update).opCount === 0) return latest;
    const before = this.doc.getStateVector();
    const result = this.doc.applyUpdate(update);
    if (stateVectorHasChanges(result.stateVector, before)) {
      this.emit('storage', result);
      latest = result;
    }
    return latest;
  }

  async saveSnapshot(options?: CrdtSnapshotOptions): Promise<CrdtSnapshot> {
    const snapshot = this.doc.snapshot(options);
    if (this.storage !== undefined) await this.storage.saveSnapshot(this.documentId, snapshot);
    return cloneCrdtSnapshot(snapshot);
  }

  async compactStorage(options?: CrdtStorageCompactionOptions): Promise<CrdtStorageCompactionResult> {
    return compactCrdtStorage(this, options);
  }

  private async persistAndEmit(
    source: CrdtDocHandleUpdate['source'],
    result: CrdtCommitResult,
    peerId?: string
  ): Promise<void> {
    if (inspectCrdtUpdate(result.update).opCount === 0) return;
    if (this.storage !== undefined) await this.storage.appendUpdate(this.documentId, result.update);
    this.emit(source, result, peerId);
    if (source === 'local' && this.provider !== undefined) await this.provider.sync();
  }

  private emit(source: CrdtDocHandleUpdate['source'], result: CrdtCommitResult, peerId?: string): void {
    if (this.listeners.size === 0) return;
    const event: CrdtDocHandleUpdate = {
      source,
      documentId: this.documentId,
      update: result.update,
      result
    };
    if (peerId !== undefined) event.peerId = peerId;
    this.listeners.forEach((listener) => listener(event));
  }
}

class FrontierCrdtRepo implements CrdtRepo {
  readonly peerId?: string;
  readonly storage?: CrdtStorageAdapter;
  private readonly handles = new Map<string, CrdtDocHandle>();
  private readonly handleUnsubscribers = new Map<string, () => void>();
  private readonly listeners = new Set<CrdtRepoEventListener>();
  private readonly syncStates = new Map<string, CrdtSyncPeerStates>();
  private readonly sync?: CrdtSyncProviderOptions;

  constructor(options?: CrdtRepoOptions) {
    this.peerId = options?.peerId;
    this.storage = options?.storage;
    this.sync = options?.sync;
    if (options?.syncState) this.loadSyncState(options.syncState);
  }

  getDocumentIds(): string[] {
    return Array.from(this.handles.keys()).sort();
  }

  async listStoredDocuments(): Promise<string[]> {
    if (this.storage?.listDocuments === undefined) return [];
    return (await this.storage.listDocuments()).slice().sort();
  }

  getSyncState(): CrdtRepoSyncState {
    const out: CrdtRepoSyncState = {};
    const documentIds = new Set<string>();
    this.syncStates.forEach((_state, documentId) => documentIds.add(documentId));
    this.handles.forEach((_handle, documentId) => documentIds.add(documentId));
    const sortedDocumentIds = Array.from(documentIds).sort();
    for (let i = 0; i < sortedDocumentIds.length; i++) {
      const documentId = sortedDocumentIds[i];
      const handle = this.handles.get(documentId);
      out[documentId] = handle === undefined
        ? cloneCrdtSyncPeerStates(this.syncStates.get(documentId) ?? {})
        : handle.endpoint.getPeerStateVectors();
    }
    return out;
  }

  loadSyncState(state?: CrdtRepoSyncState | null): void {
    this.syncStates.clear();
    if (state === undefined || state === null) {
      this.handles.forEach((handle) => handle.endpoint.setPeerStateVectors(null));
      return;
    }
    const documentIds = Object.keys(state).sort();
    for (let i = 0; i < documentIds.length; i++) {
      const documentId = documentIds[i];
      assertDocumentId(documentId);
      const peerStates = cloneCrdtSyncPeerStates(state[documentId]);
      this.syncStates.set(documentId, peerStates);
      const handle = this.handles.get(documentId);
      if (handle !== undefined) handle.endpoint.setPeerStateVectors(peerStates);
    }
  }

  get(documentIdOrUrl: string): CrdtDocHandle | undefined {
    return this.handles.get(resolveDocumentId(documentIdOrUrl));
  }

  subscribe(listener: CrdtRepoEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  create(documentId: string, options?: CrdtRepoOpenOptions): CrdtDocHandle {
    assertDocumentId(documentId);
    const existing = this.handles.get(documentId);
    if (existing !== undefined) return existing;
    const syncState = this.syncStates.get(documentId);
    const handle = createCrdtDocHandle({
      ...options,
      documentId,
      peerId: options?.peerId ?? this.peerId,
      storage: options?.storage ?? this.storage,
      sync: mergeSyncProviderOptions(this.sync, options?.sync)
    });
    if (syncState !== undefined) handle.endpoint.setPeerStateVectors(syncState);
    this.handles.set(documentId, handle);
    this.handleUnsubscribers.set(documentId, handle.subscribe((update) => {
      this.emit({ type: 'update', documentId, handle, update });
    }));
    this.emit({ type: 'open', documentId, handle });
    return handle;
  }

  async open(documentIdOrUrl: string, options?: CrdtRepoOpenOptions): Promise<CrdtDocHandle> {
    const parts = tryParseCrdtDocumentUrl(documentIdOrUrl);
    const documentId = parts === null ? documentIdOrUrl : parts.documentId;
    const handle = this.create(documentId, {
      ...options,
      peerId: options?.peerId,
      sync: mergeSyncProviderOptions(options?.sync, syncOptionsFromUrlParts(parts))
    });
    if (options?.load !== false) await handle.load();
    return handle;
  }

  async openStoredDocuments(options?: CrdtRepoOpenOptions): Promise<CrdtDocHandle[]> {
    const documentIds = await this.listStoredDocuments();
    const handles: CrdtDocHandle[] = new Array(documentIds.length);
    for (let i = 0; i < documentIds.length; i++) {
      handles[i] = await this.open(documentIds[i], options);
    }
    return handles;
  }

  async connectAll(): Promise<void> {
    const providers = this.getProviders();
    for (let i = 0; i < providers.length; i++) await providers[i].connect();
  }

  async syncAll(peerId?: string): Promise<void> {
    const providers = this.getProviders();
    for (let i = 0; i < providers.length; i++) await providers[i].sync(peerId);
  }

  async disconnectAll(): Promise<void> {
    const providers = this.getProviders();
    for (let i = 0; i < providers.length; i++) await providers[i].disconnect();
  }

  close(documentIdOrUrl: string): boolean {
    const documentId = resolveDocumentId(documentIdOrUrl);
    const handle = this.handles.get(documentId);
    if (handle !== undefined) this.syncStates.set(documentId, handle.endpoint.getPeerStateVectors());
    const deleted = this.handles.delete(documentId);
    const unsubscribe = this.handleUnsubscribers.get(documentId);
    if (unsubscribe !== undefined) {
      unsubscribe();
      this.handleUnsubscribers.delete(documentId);
    }
    if (deleted) this.emit({ type: 'close', documentId, handle });
    return deleted;
  }

  async delete(documentIdOrUrl: string): Promise<boolean | void> {
    const documentId = resolveDocumentId(documentIdOrUrl);
    const handle = this.handles.get(documentId);
    this.close(documentId);
    this.syncStates.delete(documentId);
    const result = this.storage !== undefined ? await this.storage.deleteDocument(documentId) : false;
    this.emit({ type: 'delete', documentId, handle });
    return result;
  }

  async receive(message: CrdtSyncMessageInput, peerId?: string): Promise<CrdtSyncMessage | undefined> {
    const decoded = decodeCrdtSyncMessage(message);
    if (decoded.documentId === undefined) {
      if (this.handles.size !== 1) throw new TypeError('CRDT sync message is missing documentId');
      const handle = this.handles.values().next().value as CrdtDocHandle;
      return handle.receiveSyncMessage(decoded, peerId);
    }
    const handle = await this.open(decoded.documentId);
    return handle.receiveSyncMessage(decoded, peerId);
  }

  private getProviders(): CrdtSyncProvider[] {
    const documentIds = this.getDocumentIds();
    const providers: CrdtSyncProvider[] = [];
    for (let i = 0; i < documentIds.length; i++) {
      const provider = this.handles.get(documentIds[i])?.provider;
      if (provider !== undefined) providers[providers.length] = provider;
    }
    return providers;
  }

  private emit(event: CrdtRepoEvent): void {
    if (this.listeners.size === 0) return;
    this.listeners.forEach((listener) => listener(event));
  }
}

function resolveDocumentId(documentIdOrUrl: string): string {
  const parts = tryParseCrdtDocumentUrl(documentIdOrUrl);
  return parts === null ? documentIdOrUrl : parts.documentId;
}

function tryParseCrdtDocumentUrl(input: string): CrdtDocumentUrlParts | null {
  try {
    return parseCrdtDocumentUrl(input);
  } catch {
    return null;
  }
}

function syncOptionsFromUrlParts(parts: CrdtDocumentUrlParts | null): CrdtSyncProviderOptions | undefined {
  if (parts === null || parts.peerId === undefined) return undefined;
  return { peers: [parts.peerId] };
}

function mergeSyncProviderOptions(
  base?: CrdtSyncProviderOptions,
  override?: CrdtSyncProviderOptions
): CrdtSyncProviderOptions | undefined {
  if (base === undefined) return override;
  if (override === undefined) return base;
  const peers = mergePeerLists(base.peers, override.peers);
  return {
    ...base,
    ...override,
    peers
  };
}

function mergePeerLists(left?: string[], right?: string[]): string[] | undefined {
  if (left === undefined) return right === undefined ? undefined : right.slice();
  if (right === undefined) return left.slice();
  const peers = new Set<string>();
  for (let i = 0; i < left.length; i++) peers.add(left[i]);
  for (let i = 0; i < right.length; i++) peers.add(right[i]);
  return Array.from(peers).sort();
}
