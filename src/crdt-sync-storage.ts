import { createCrdtMemoryStorageAdapter } from './crdt-sync-memory-storage.js';
import {
  cloneCrdtSnapshot,
  sumUpdateBytes
} from './crdt-sync-storage-utils.js';
import type {
  CrdtDocHandle,
  CrdtStorageCompactionOptions,
  CrdtStorageCompactionResult
} from './types.js';

export { createCrdtMemoryStorageAdapter };

export async function compactCrdtStorage(
  handle: CrdtDocHandle,
  options?: CrdtStorageCompactionOptions
): Promise<CrdtStorageCompactionResult> {
  const storage = handle.storage;
  if (storage === undefined) throw new TypeError('CRDT doc handle has no storage adapter');
  const beforeUpdates = await storage.loadUpdates(handle.documentId);
  const snapshot = handle.doc.snapshot({
    includeMetadata: options?.includeMetadata,
    includeView: options?.includeView
  });
  const replacementUpdates = options?.keepSnapshotUpdate === true ? [snapshot.update] : [];
  let compactedUpdates = false;
  if (storage.compact !== undefined) {
    await storage.compact(handle.documentId, snapshot, replacementUpdates);
    compactedUpdates = true;
  } else {
    await storage.saveSnapshot(handle.documentId, snapshot);
    if (storage.replaceUpdates !== undefined) {
      await storage.replaceUpdates(handle.documentId, replacementUpdates);
      compactedUpdates = true;
    }
  }
  const afterUpdates = await storage.loadUpdates(handle.documentId);
  return {
    documentId: handle.documentId,
    snapshot: cloneCrdtSnapshot(snapshot),
    beforeUpdateCount: beforeUpdates.length,
    afterUpdateCount: afterUpdates.length,
    updateBytesBefore: sumUpdateBytes(beforeUpdates),
    updateBytesAfter: sumUpdateBytes(afterUpdates),
    snapshotBytes: snapshot.update.byteLength,
    compactedUpdates
  };
}
