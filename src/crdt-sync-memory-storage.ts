import { assertDocumentId } from './crdt-sync-wire.js';
import {
  cloneCrdtSnapshot,
  cloneEncodedUpdate,
  cloneEncodedUpdateSync
} from './crdt-sync-storage-utils.js';
import type {
  CrdtSnapshot,
  CrdtStateVector,
  CrdtStorageAdapter,
  CrdtStorageEvent,
  CrdtStorageEventListener,
  CrdtUpdateInput
} from './types.js';

export function createCrdtMemoryStorageAdapter(): CrdtStorageAdapter {
  return new FrontierCrdtMemoryStorageAdapter();
}

class FrontierCrdtMemoryStorageAdapter implements CrdtStorageAdapter {
  private readonly snapshots = new Map<string, CrdtSnapshot>();
  private readonly updates = new Map<string, Uint8Array[]>();
  private readonly listeners = new Set<CrdtStorageEventListener>();
  private readonly documentListeners = new Map<string, Set<CrdtStorageEventListener>>();

  loadSnapshot(documentId: string): CrdtSnapshot | undefined {
    const snapshot = this.snapshots.get(documentId);
    return snapshot === undefined ? undefined : cloneCrdtSnapshot(snapshot);
  }

  saveSnapshot(documentId: string, snapshot: CrdtSnapshot): void {
    assertDocumentId(documentId);
    const stored = cloneCrdtSnapshot(snapshot);
    this.snapshots.set(documentId, stored);
    this.emit({ type: 'snapshot', documentId, snapshot: stored });
  }

  appendUpdate(documentId: string, update: CrdtUpdateInput): void | Promise<void> {
    assertDocumentId(documentId);
    const stored = cloneEncodedUpdateSync(update);
    if (stored !== undefined) {
      this.appendStoredUpdate(documentId, stored);
      return;
    }
    return cloneEncodedUpdate(update).then((encoded) => {
      this.appendStoredUpdate(documentId, encoded);
    });
  }

  replaceUpdates(documentId: string, updates: readonly CrdtUpdateInput[]): void | Promise<void> {
    assertDocumentId(documentId);
    if (updates.length === 0) {
      this.updates.delete(documentId);
      this.emit({ type: 'replace-updates', documentId, updateCount: 0 });
      return;
    }
    const next: Uint8Array[] = new Array(updates.length);
    const pending: Array<Promise<void>> = [];
    for (let i = 0; i < updates.length; i++) {
      const stored = cloneEncodedUpdateSync(updates[i]);
      if (stored !== undefined) {
        next[i] = stored;
      } else {
        pending[pending.length] = cloneEncodedUpdate(updates[i]).then((encoded) => {
          next[i] = encoded;
        });
      }
    }
    if (pending.length === 0) {
      this.replaceStoredUpdates(documentId, next);
      return;
    }
    return Promise.all(pending).then(() => {
      this.replaceStoredUpdates(documentId, next);
    });
  }

  compact(documentId: string, snapshot: CrdtSnapshot, updates: readonly CrdtUpdateInput[] = []): void | Promise<void> {
    assertDocumentId(documentId);
    const storedSnapshot = cloneCrdtSnapshot(snapshot);
    if (updates.length === 0) {
      this.snapshots.set(documentId, storedSnapshot);
      this.updates.delete(documentId);
      this.emit({
        type: 'compact',
        documentId,
        snapshot: storedSnapshot,
        updateCount: 0
      });
      return;
    }
    const next: Uint8Array[] = new Array(updates.length);
    const pending: Array<Promise<void>> = [];
    for (let i = 0; i < updates.length; i++) {
      const stored = cloneEncodedUpdateSync(updates[i]);
      if (stored !== undefined) {
        next[i] = stored;
      } else {
        pending[pending.length] = cloneEncodedUpdate(updates[i]).then((encoded) => {
          next[i] = encoded;
        });
      }
    }
    if (pending.length === 0) {
      this.compactStoredUpdates(documentId, storedSnapshot, next);
      return;
    }
    return Promise.all(pending).then(() => {
      this.compactStoredUpdates(documentId, storedSnapshot, next);
    });
  }

  loadUpdates(documentId: string, stateVector?: CrdtStateVector | null): Uint8Array[] | Promise<Uint8Array[]> {
    assertDocumentId(documentId);
    const updates = this.updates.get(documentId);
    if (updates === undefined || updates.length === 0) return [];
    if (stateVector === undefined || stateVector === null) return updates.map((update) => update.slice());
    return this.loadMissingUpdates(updates, stateVector);
  }

  loadMergedUpdate(documentId: string, stateVector?: CrdtStateVector | null): Uint8Array | Promise<Uint8Array> {
    const updates = this.loadUpdates(documentId, stateVector);
    if (Array.isArray(updates) && updates.length <= 1) return updates.length === 0 ? new Uint8Array(0) : updates[0].slice();
    return Promise.resolve(updates).then(async (resolved) => {
      const { mergeCrdtUpdates } = await import('@shapeshift-labs/frontier-crdt/update');
      return mergeCrdtUpdates(resolved);
    });
  }

  deleteDocument(documentId: string): boolean {
    assertDocumentId(documentId);
    const hadSnapshot = this.snapshots.delete(documentId);
    const hadUpdates = this.updates.delete(documentId);
    const deleted = hadSnapshot || hadUpdates;
    if (deleted) this.emit({ type: 'delete', documentId, deleted });
    return deleted;
  }

  listDocuments(): string[] {
    const ids = new Set<string>();
    this.snapshots.forEach((_value, key) => ids.add(key));
    this.updates.forEach((_value, key) => ids.add(key));
    return Array.from(ids).sort();
  }

  subscribe(listener: CrdtStorageEventListener, documentId?: string): () => void {
    if (documentId === undefined) {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    }
    assertDocumentId(documentId);
    let listeners = this.documentListeners.get(documentId);
    if (listeners === undefined) {
      listeners = new Set();
      this.documentListeners.set(documentId, listeners);
    }
    listeners.add(listener);
    return () => {
      const current = this.documentListeners.get(documentId);
      if (current === undefined) return;
      current.delete(listener);
      if (current.size === 0) this.documentListeners.delete(documentId);
    };
  }

  private appendStoredUpdate(documentId: string, update: Uint8Array): void {
    let updates = this.updates.get(documentId);
    if (updates === undefined) {
      updates = [];
      this.updates.set(documentId, updates);
    }
    updates[updates.length] = update;
    this.emit({ type: 'append-update', documentId, update });
  }

  private replaceStoredUpdates(documentId: string, updates: Uint8Array[]): void {
    this.updates.set(documentId, updates);
    this.emit({ type: 'replace-updates', documentId, updateCount: updates.length });
  }

  private compactStoredUpdates(documentId: string, snapshot: CrdtSnapshot, updates: Uint8Array[]): void {
    this.snapshots.set(documentId, snapshot);
    this.updates.set(documentId, updates);
    this.emit({
      type: 'compact',
      documentId,
      snapshot,
      updateCount: updates.length
    });
  }

  private async loadMissingUpdates(updates: readonly Uint8Array[], stateVector: CrdtStateVector): Promise<Uint8Array[]> {
    const { diffCrdtUpdate, inspectCrdtUpdate } = await import('@shapeshift-labs/frontier-crdt/update');
    const missing: Uint8Array[] = [];
    for (let i = 0; i < updates.length; i++) {
      const diff = diffCrdtUpdate(updates[i], stateVector);
      if (inspectCrdtUpdate(diff).opCount > 0) missing[missing.length] = diff;
    }
    return missing;
  }

  private emit(event: CrdtStorageEvent): void {
    if (this.listeners.size === 0 && !this.documentListeners.has(event.documentId)) return;
    this.listeners.forEach((listener) => listener(cloneCrdtStorageEvent(event)));
    const listeners = this.documentListeners.get(event.documentId);
    if (listeners !== undefined) listeners.forEach((listener) => listener(cloneCrdtStorageEvent(event)));
  }
}

function cloneCrdtStorageEvent(event: CrdtStorageEvent): CrdtStorageEvent {
  const cloned: CrdtStorageEvent = {
    type: event.type,
    documentId: event.documentId
  };
  if (event.snapshot !== undefined) cloned.snapshot = cloneCrdtSnapshot(event.snapshot);
  if (event.update !== undefined) cloned.update = event.update.slice();
  if (event.updateCount !== undefined) cloned.updateCount = event.updateCount;
  if (event.deleted !== undefined) cloned.deleted = event.deleted;
  return cloned;
}
