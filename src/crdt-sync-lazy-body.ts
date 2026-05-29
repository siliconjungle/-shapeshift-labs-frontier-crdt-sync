import {
  encodeCrdtUpdate,
  getCrdtUpdateActorRanges,
  getCrdtUpdateStateVector
} from '@shapeshift-labs/frontier-crdt/update';
import {
  cloneActorRanges,
  cloneCrdtSyncMessage,
  cloneStateVector
} from './crdt-sync-wire.js';
import type {
  CrdtStateVector,
  CrdtSyncActorRange,
  CrdtSyncLazyBodyReference,
  CrdtSyncLazyBodyStoreLike,
  CrdtSyncMessage,
  CrdtUpdateInput
} from './types.js';

const DEFAULT_LAZY_UPDATE_THRESHOLD_BYTES = 4096;

export interface CrdtSyncLazyBodyStoreStats {
  bodies: number;
  puts: number;
  hits: number;
  misses: number;
  duplicates: number;
  storedBytes: number;
  logicalBytes: number;
  dedupeRatio: number;
}

export interface CrdtSyncLazyBodyStore extends CrdtSyncLazyBodyStoreLike {
  readonly size: number;
  getStats(): CrdtSyncLazyBodyStoreStats;
}

export interface CrdtSyncLazyBodyStoreOptions {
  maxBodies?: number;
  maxBytes?: number;
}

export interface CrdtSyncLazyUpdateOptions {
  thresholdBytes?: number;
}

interface StoredLazyBody {
  reference: CrdtSyncLazyBodyReference;
  bytes: Uint8Array;
}

export function createCrdtSyncLazyBodyStore(
  options: CrdtSyncLazyBodyStoreOptions = {}
): CrdtSyncLazyBodyStore {
  return new FrontierCrdtSyncLazyBodyStore(options);
}

export function createCrdtSyncLazyUpdateMessage(
  message: CrdtSyncMessage,
  store: CrdtSyncLazyBodyStoreLike,
  options: CrdtSyncLazyUpdateOptions = {}
): CrdtSyncMessage {
  const cloned = cloneCrdtSyncMessage(message);
  if (cloned.type !== 'update' || cloned.update === undefined) return cloned;
  const threshold = options.thresholdBytes === undefined
    ? DEFAULT_LAZY_UPDATE_THRESHOLD_BYTES
    : Math.max(0, Math.floor(options.thresholdBytes));
  if (cloned.update.byteLength < threshold) return cloned;
  cloned.updateBody = store.put(cloned.update);
  delete cloned.update;
  return cloned;
}

export function hydrateCrdtSyncLazyUpdateMessage(
  message: CrdtSyncMessage,
  store: CrdtSyncLazyBodyStoreLike
): CrdtSyncMessage {
  const cloned = cloneCrdtSyncMessage(message);
  if (cloned.update !== undefined || cloned.updateBody === undefined) return cloned;
  const bytes = store.get(cloned.updateBody);
  if (bytes === undefined) throw new RangeError('CRDT sync lazy update body is missing: ' + cloned.updateBody.hash);
  cloned.update = bytes;
  return cloned;
}

export function hashCrdtSyncLazyBody(update: CrdtUpdateInput): string {
  return hashBytes(normalizeUpdateBytes(update));
}

class FrontierCrdtSyncLazyBodyStore implements CrdtSyncLazyBodyStore {
  private readonly bodies = new Map<string, StoredLazyBody>();
  private readonly maxBodies: number;
  private readonly maxBytes: number;
  private storedBytes = 0;
  private logicalBytes = 0;
  private puts = 0;
  private hits = 0;
  private misses = 0;
  private duplicates = 0;

  constructor(options: CrdtSyncLazyBodyStoreOptions) {
    this.maxBodies = options.maxBodies === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.floor(options.maxBodies));
    this.maxBytes = options.maxBytes === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.floor(options.maxBytes));
  }

  get size(): number {
    return this.bodies.size;
  }

  put(update: CrdtUpdateInput): CrdtSyncLazyBodyReference {
    const bytes = normalizeUpdateBytes(update);
    const reference = createLazyBodyReference(bytes);
    this.puts++;
    this.logicalBytes += bytes.byteLength;
    const previous = this.bodies.get(reference.hash);
    if (previous !== undefined && sameReference(previous.reference, reference)) {
      this.duplicates++;
      return cloneReference(previous.reference);
    }
    this.bodies.set(reference.hash, {
      reference,
      bytes
    });
    this.storedBytes += bytes.byteLength;
    this.enforceLimits();
    return cloneReference(reference);
  }

  get(reference: CrdtSyncLazyBodyReference): Uint8Array | undefined {
    const expected = cloneReference(reference);
    const stored = this.bodies.get(expected.hash);
    if (stored === undefined || !sameReference(stored.reference, expected)) {
      this.misses++;
      return undefined;
    }
    this.hits++;
    return stored.bytes.slice();
  }

  has(reference: CrdtSyncLazyBodyReference): boolean {
    const expected = cloneReference(reference);
    const stored = this.bodies.get(expected.hash);
    return stored !== undefined && sameReference(stored.reference, expected);
  }

  getStats(): CrdtSyncLazyBodyStoreStats {
    return {
      bodies: this.bodies.size,
      puts: this.puts,
      hits: this.hits,
      misses: this.misses,
      duplicates: this.duplicates,
      storedBytes: this.storedBytes,
      logicalBytes: this.logicalBytes,
      dedupeRatio: this.logicalBytes === 0 ? 1 : this.storedBytes / this.logicalBytes
    };
  }

  private enforceLimits(): void {
    while (
      this.bodies.size > this.maxBodies ||
      this.storedBytes > this.maxBytes
    ) {
      const first = this.bodies.entries().next();
      if (first.done) return;
      const [hash, body] = first.value;
      this.bodies.delete(hash);
      this.storedBytes -= body.bytes.byteLength;
    }
  }
}

function createLazyBodyReference(bytes: Uint8Array): CrdtSyncLazyBodyReference {
  return {
    version: 1,
    kind: 'crdt-update',
    hash: hashBytes(bytes),
    byteLength: bytes.byteLength,
    stateVector: getCrdtUpdateStateVector(bytes),
    actorRanges: cloneActorRanges(getCrdtUpdateActorRanges(bytes))
  };
}

function normalizeUpdateBytes(update: CrdtUpdateInput): Uint8Array {
  if (update instanceof Uint8Array) return update.slice();
  if (update instanceof ArrayBuffer) return new Uint8Array(update).slice();
  if (ArrayBuffer.isView(update)) return new Uint8Array(update.buffer, update.byteOffset, update.byteLength).slice();
  return encodeCrdtUpdate(update);
}

function cloneReference(reference: CrdtSyncLazyBodyReference): CrdtSyncLazyBodyReference {
  return {
    version: 1,
    kind: 'crdt-update',
    hash: reference.hash,
    byteLength: reference.byteLength,
    stateVector: cloneStateVector(reference.stateVector),
    actorRanges: cloneActorRanges(reference.actorRanges)
  };
}

function sameReference(left: CrdtSyncLazyBodyReference, right: CrdtSyncLazyBodyReference): boolean {
  return left.version === right.version &&
    left.kind === right.kind &&
    left.hash === right.hash &&
    left.byteLength === right.byteLength &&
    stateVectorsEqual(left.stateVector, right.stateVector) &&
    actorRangesEqual(left.actorRanges, right.actorRanges);
}

function stateVectorsEqual(left: CrdtStateVector, right: CrdtStateVector): boolean {
  for (const actor in left) {
    if (left[actor] !== (right[actor] || 0)) return false;
  }
  for (const actor in right) {
    if (right[actor] !== (left[actor] || 0)) return false;
  }
  return true;
}

function actorRangesEqual(
  left: readonly CrdtSyncActorRange[],
  right: readonly CrdtSyncActorRange[]
): boolean {
  const normalizedLeft = cloneActorRanges(left);
  const normalizedRight = cloneActorRanges(right);
  if (normalizedLeft.length !== normalizedRight.length) return false;
  for (let i = 0; i < normalizedLeft.length; i++) {
    if (
      normalizedLeft[i].actor !== normalizedRight[i].actor ||
      normalizedLeft[i].start !== normalizedRight[i].start ||
      normalizedLeft[i].end !== normalizedRight[i].end
    ) {
      return false;
    }
  }
  return true;
}

function hashBytes(bytes: Uint8Array): string {
  let left = 0x811c9dc5;
  let right = (0x811c9dc5 ^ bytes.byteLength) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    left ^= byte;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= byte + ((i + 1) & 0xff);
    right = Math.imul(right, 0x01000193) >>> 0;
  }
  return 'fnv1a64:' + toHex32(left) + toHex32(right);
}

function toHex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}
