import { cloneJson } from '@shapeshift-labs/frontier/clone';
import type {
  CrdtCommitMetadataEntry,
  CrdtSnapshot,
  CrdtUpdateInput,
  CrdtVersion,
  JsonObject,
  JsonValue
} from './types.js';

export function cloneEncodedUpdateSync(update: CrdtUpdateInput): Uint8Array | undefined {
  if (update instanceof ArrayBuffer) return new Uint8Array(update).slice();
  if (ArrayBuffer.isView(update)) return new Uint8Array(update.buffer, update.byteOffset, update.byteLength).slice();
  return undefined;
}

export async function cloneEncodedUpdate(update: CrdtUpdateInput): Promise<Uint8Array> {
  const cloned = cloneEncodedUpdateSync(update);
  if (cloned !== undefined) return cloned;
  const { mergeCrdtUpdates } = await import('@shapeshift-labs/frontier-crdt/update');
  return mergeCrdtUpdates([update]);
}

export function cloneCrdtSnapshot(snapshot: CrdtSnapshot): CrdtSnapshot {
  const out: CrdtSnapshot = {
    version: cloneCrdtVersion(snapshot.version),
    heads: snapshot.heads.slice(),
    stateVector: cloneStateVector(snapshot.stateVector),
    update: snapshot.update.slice()
  };
  if (snapshot.baseVersion !== undefined) out.baseVersion = snapshot.baseVersion === null ? null : cloneCrdtVersion(snapshot.baseVersion);
  if (snapshot.metadata !== undefined) {
    out.metadata = snapshot.metadata.map((entry): CrdtCommitMetadataEntry => ({
      head: entry.head,
      metadata: cloneJson(entry.metadata) as JsonObject
    }));
  }
  if (snapshot.view !== undefined) out.view = cloneJson(snapshot.view as JsonValue);
  return out;
}

export function sumUpdateBytes(updates: readonly Uint8Array[]): number {
  let bytes = 0;
  for (let i = 0; i < updates.length; i++) bytes += updates[i].byteLength;
  return bytes;
}

function cloneCrdtVersion(version: CrdtVersion): CrdtVersion {
  return Array.isArray(version) ? version.slice() : cloneStateVector(version);
}

function cloneStateVector(vector: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const actor in vector) out[actor] = vector[actor];
  return out;
}
