import type {
  CrdtDocumentUrlOptions,
  CrdtDocumentUrlParts,
  CrdtSyncActorRange,
  CrdtSyncLazyBodyReference,
  CrdtSyncReconciliation,
  CrdtSyncReconciliationCell,
  CrdtStateVector,
  CrdtSyncMessage,
  CrdtSyncMessageInput,
  CrdtSyncPeerStates,
  CrdtSyncTransportPayload
} from './types.js';

const CRDT_SYNC_MESSAGE_MAGIC = 'frontier-crdt-sync';
const CRDT_SYNC_MESSAGE_VERSION = 1;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const base64Lookup = createBase64Lookup();

export function createCrdtDocumentUrl(documentId: string, options?: CrdtDocumentUrlOptions): string {
  if (typeof documentId !== 'string' || documentId.length === 0) {
    throw new TypeError('CRDT document id must be a non-empty string');
  }
  const params = new URLSearchParams();
  if (options) {
    appendUrlParam(params, 'peer', options.peerId);
    appendUrlParam(params, 'branch', options.branch);
    appendUrlParam(params, 'version', options.version);
    if (options.params) {
      const keys = Object.keys(options.params).sort();
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key === 'peer' || key === 'branch' || key === 'version') continue;
        appendUrlParam(params, key, options.params[key]);
      }
    }
  }
  const query = params.toString();
  return `frontier://doc/${encodeURIComponent(documentId)}${query.length === 0 ? '' : `?${query}`}`;
}

export function parseCrdtDocumentUrl(input: string): CrdtDocumentUrlParts {
  const url = new URL(input);
  if (url.protocol !== 'frontier:' || url.hostname !== 'doc') {
    throw new TypeError('invalid CRDT document URL');
  }
  const rawDocumentId = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  const documentId = decodeURIComponent(rawDocumentId);
  if (documentId.length === 0) throw new TypeError('invalid CRDT document URL');
  const parts: CrdtDocumentUrlParts = {
    documentId,
    params: {}
  };
  const peerId = url.searchParams.get('peer');
  const branch = url.searchParams.get('branch');
  const version = url.searchParams.get('version');
  if (peerId !== null) parts.peerId = peerId;
  if (branch !== null) parts.branch = branch;
  if (version !== null) parts.version = version;
  url.searchParams.forEach((value, key) => {
    if (key !== 'peer' && key !== 'branch' && key !== 'version') parts.params[key] = value;
  });
  return parts;
}

export function encodeCrdtSyncMessage(message: CrdtSyncMessage): Uint8Array {
  const normalized = cloneCrdtSyncMessage(message);
  const payload: Record<string, unknown> = {
    magic: CRDT_SYNC_MESSAGE_MAGIC,
    version: CRDT_SYNC_MESSAGE_VERSION,
    type: normalized.type,
    stateVector: normalized.stateVector
  };
  if (normalized.documentId !== undefined) payload.documentId = normalized.documentId;
  if (normalized.senderId !== undefined) payload.senderId = normalized.senderId;
  if (normalized.actorRanges !== undefined) payload.actorRanges = normalized.actorRanges;
  if (normalized.reconciliation !== undefined) payload.reconciliation = normalized.reconciliation;
  if (normalized.update !== undefined) payload.update = bytesToBase64(normalized.update);
  if (normalized.updateBody !== undefined) payload.updateBody = normalized.updateBody;
  return textEncoder.encode(JSON.stringify(payload));
}

export function decodeCrdtSyncMessage(input: CrdtSyncMessageInput): CrdtSyncMessage {
  if (typeof input === 'string') return decodeCrdtSyncMessageText(input);
  if (isCrdtSyncMessage(input)) return cloneCrdtSyncMessage(input);
  return decodeCrdtSyncMessageText(textDecoder.decode(asUint8Array(input)));
}

export function stateVectorHasChanges(source: CrdtStateVector, known: CrdtStateVector): boolean {
  for (const actor in source) {
    if (source[actor] > (known[actor] || 0)) return true;
  }
  return false;
}

export function mergeStateVector(target: CrdtStateVector, source: CrdtStateVector): void {
  for (const actor in source) {
    const seq = source[actor];
    if (seq > (target[actor] || 0)) target[actor] = seq;
  }
}

export function cloneStateVector(vector: CrdtStateVector): CrdtStateVector {
  const out: CrdtStateVector = {};
  for (const actor in vector) out[actor] = vector[actor];
  return out;
}

export function cloneCrdtSyncPeerStates(peers: CrdtSyncPeerStates): CrdtSyncPeerStates {
  const out: CrdtSyncPeerStates = {};
  const peerIds = Object.keys(peers).sort();
  for (let i = 0; i < peerIds.length; i++) {
    const peerId = peerIds[i];
    assertPeerId(peerId);
    out[peerId] = cloneStateVector(peers[peerId]);
  }
  return out;
}

export function stateVectorsEqual(left: CrdtStateVector, right: CrdtStateVector): boolean {
  for (const actor in left) {
    if (left[actor] !== (right[actor] || 0)) return false;
  }
  for (const actor in right) {
    if (right[actor] !== (left[actor] || 0)) return false;
  }
  return true;
}

export function cloneCrdtSyncMessage(message: CrdtSyncMessage): CrdtSyncMessage {
  if (!isCrdtSyncMessage(message)) throw new TypeError('invalid CRDT sync message');
  const cloned: CrdtSyncMessage = {
    type: message.type,
    stateVector: cloneStateVector(message.stateVector)
  };
  if (message.documentId !== undefined) cloned.documentId = message.documentId;
  if (message.senderId !== undefined) cloned.senderId = message.senderId;
  if (message.actorRanges !== undefined) cloned.actorRanges = cloneActorRanges(message.actorRanges);
  if (message.reconciliation !== undefined) cloned.reconciliation = cloneReconciliation(message.reconciliation);
  if (message.update !== undefined) cloned.update = message.update.slice();
  if (message.updateBody !== undefined) cloned.updateBody = cloneLazyBodyReference(message.updateBody);
  return cloned;
}

export function cloneReconciliation(reconciliation: CrdtSyncReconciliation): CrdtSyncReconciliation {
  validateReconciliation(reconciliation);
  return {
    version: 1,
    strategy: reconciliation.strategy,
    bucketSize: reconciliation.bucketSize,
    rangeCount: reconciliation.rangeCount,
    opCount: reconciliation.opCount,
    cells: cloneReconciliationCells(reconciliation.cells)
  };
}

export function cloneActorRanges(ranges: readonly CrdtSyncActorRange[]): CrdtSyncActorRange[] {
  validateActorRanges(ranges);
  return normalizeActorRanges(ranges);
}

export function cloneCrdtSyncTransportPayload(payload: CrdtSyncTransportPayload): CrdtSyncTransportPayload {
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload).slice();
  if (ArrayBuffer.isView(payload)) {
    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength).slice();
  }
  return cloneCrdtSyncMessage(payload);
}

export function assertDocumentId(documentId: string): void {
  if (typeof documentId !== 'string' || documentId.length === 0) {
    throw new TypeError('CRDT document id must be a non-empty string');
  }
}

export function assertPeerId(peerId: string): void {
  if (typeof peerId !== 'string' || peerId.length === 0) {
    throw new TypeError('CRDT peer id must be a non-empty string');
  }
}

function decodeCrdtSyncMessageText(text: string): CrdtSyncMessage {
  const value = JSON.parse(text) as unknown;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid CRDT sync message');
  }
  const envelope = value as {
    magic?: unknown;
    version?: unknown;
    type?: unknown;
    documentId?: unknown;
    senderId?: unknown;
    stateVector?: unknown;
    actorRanges?: unknown;
    reconciliation?: unknown;
    update?: unknown;
    updateBody?: unknown;
  };
  if (envelope.magic !== CRDT_SYNC_MESSAGE_MAGIC || envelope.version !== CRDT_SYNC_MESSAGE_VERSION) {
    throw new TypeError('invalid CRDT sync message envelope');
  }
  if (
    envelope.type !== 'state-vector' &&
    envelope.type !== 'update' &&
    envelope.type !== 'ack'
  ) {
    throw new TypeError('invalid CRDT sync message type');
  }
  validateStateVector(envelope.stateVector);
  const message: CrdtSyncMessage = {
    type: envelope.type,
    stateVector: cloneStateVector(envelope.stateVector)
  };
  if (envelope.documentId !== undefined) {
    if (typeof envelope.documentId !== 'string') throw new TypeError('invalid CRDT sync document id');
    message.documentId = envelope.documentId;
  }
  if (envelope.senderId !== undefined) {
    if (typeof envelope.senderId !== 'string') throw new TypeError('invalid CRDT sync sender id');
    message.senderId = envelope.senderId;
  }
  if (envelope.actorRanges !== undefined) message.actorRanges = cloneActorRanges(envelope.actorRanges as CrdtSyncActorRange[]);
  if (envelope.reconciliation !== undefined) message.reconciliation = cloneReconciliation(envelope.reconciliation as CrdtSyncReconciliation);
  if (envelope.update !== undefined) {
    if (typeof envelope.update !== 'string') throw new TypeError('invalid CRDT sync update payload');
    message.update = base64ToBytes(envelope.update);
  }
  if (envelope.updateBody !== undefined) message.updateBody = cloneLazyBodyReference(envelope.updateBody as CrdtSyncLazyBodyReference);
  return cloneCrdtSyncMessage(message);
}

function isCrdtSyncMessage(value: unknown): value is CrdtSyncMessage {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const message = value as CrdtSyncMessage;
  if (message.type !== 'state-vector' && message.type !== 'update' && message.type !== 'ack') return false;
  if (message.documentId !== undefined && typeof message.documentId !== 'string') return false;
  if (message.senderId !== undefined && typeof message.senderId !== 'string') return false;
  if (message.actorRanges !== undefined && message.reconciliation !== undefined) return false;
  try {
    validateStateVector(message.stateVector);
    if (message.actorRanges !== undefined) validateActorRanges(message.actorRanges);
    if (message.reconciliation !== undefined) validateReconciliation(message.reconciliation);
    if (message.updateBody !== undefined) validateLazyBodyReference(message.updateBody);
  } catch {
    return false;
  }
  if (message.update !== undefined && !(message.update instanceof Uint8Array)) return false;
  return true;
}

function cloneLazyBodyReference(reference: CrdtSyncLazyBodyReference): CrdtSyncLazyBodyReference {
  validateLazyBodyReference(reference);
  return {
    version: 1,
    kind: 'crdt-update',
    hash: reference.hash,
    byteLength: reference.byteLength,
    stateVector: cloneStateVector(reference.stateVector),
    actorRanges: cloneActorRanges(reference.actorRanges)
  };
}

function validateLazyBodyReference(value: unknown): asserts value is CrdtSyncLazyBodyReference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid CRDT sync lazy body reference');
  }
  const reference = value as CrdtSyncLazyBodyReference;
  if (
    reference.version !== 1 ||
    reference.kind !== 'crdt-update' ||
    typeof reference.hash !== 'string' ||
    !/^fnv1a64:[0-9a-f]{16}$/.test(reference.hash) ||
    !Number.isSafeInteger(reference.byteLength) ||
    reference.byteLength < 0
  ) {
    throw new TypeError('invalid CRDT sync lazy body reference');
  }
  validateStateVector(reference.stateVector);
  validateActorRanges(reference.actorRanges);
}

function validateStateVector(value: unknown): asserts value is CrdtStateVector {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid CRDT sync state vector');
  }
  for (const actor in value as Record<string, unknown>) {
    const seq = (value as Record<string, unknown>)[actor];
    if (!Number.isSafeInteger(seq) || (seq as number) < 0) {
      throw new TypeError('invalid CRDT sync state vector');
    }
  }
}

function validateActorRanges(value: unknown): asserts value is readonly CrdtSyncActorRange[] {
  if (!Array.isArray(value)) throw new TypeError('invalid CRDT sync actor ranges');
  for (let i = 0; i < value.length; i++) {
    const range = value[i] as CrdtSyncActorRange;
    if (range === null || typeof range !== 'object' || Array.isArray(range)) {
      throw new TypeError('invalid CRDT sync actor range');
    }
    if (
      typeof range.actor !== 'string' ||
      range.actor.length === 0 ||
      range.actor.includes(':') ||
      range.actor.includes('/')
    ) {
      throw new TypeError('invalid CRDT sync actor range');
    }
    if (
      !Number.isSafeInteger(range.start) ||
      !Number.isSafeInteger(range.end) ||
      range.start < 1 ||
      range.end < range.start
    ) {
      throw new TypeError('invalid CRDT sync actor range');
    }
  }
}

function validateReconciliation(value: unknown): asserts value is CrdtSyncReconciliation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid CRDT sync reconciliation');
  }
  const reconciliation = value as CrdtSyncReconciliation;
  if (
    reconciliation.version !== 1 ||
    reconciliation.strategy !== 'merkle-iblt' ||
    !Number.isSafeInteger(reconciliation.bucketSize) ||
    reconciliation.bucketSize < 1 ||
    !Number.isSafeInteger(reconciliation.rangeCount) ||
    reconciliation.rangeCount < 0 ||
    !Number.isSafeInteger(reconciliation.opCount) ||
    reconciliation.opCount < 0 ||
    !Array.isArray(reconciliation.cells) ||
    reconciliation.cells.length > 4096
  ) {
    throw new TypeError('invalid CRDT sync reconciliation');
  }
  validateReconciliationCells(reconciliation.cells);
}

function validateReconciliationCells(cells: unknown): asserts cells is CrdtSyncReconciliationCell[] {
  if (!Array.isArray(cells)) throw new TypeError('invalid CRDT sync reconciliation cells');
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i] as CrdtSyncReconciliationCell;
    if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) {
      throw new TypeError('invalid CRDT sync reconciliation cell');
    }
    if (
      typeof cell.actor !== 'string' ||
      cell.actor.length === 0 ||
      cell.actor.includes(':') ||
      cell.actor.includes('/') ||
      !Number.isSafeInteger(cell.start) ||
      !Number.isSafeInteger(cell.end) ||
      !Number.isSafeInteger(cell.count) ||
      !Number.isSafeInteger(cell.hash) ||
      cell.start < 1 ||
      cell.end < cell.start ||
      cell.count < 0 ||
      cell.count > cell.end - cell.start + 1 ||
      cell.hash < 0 ||
      cell.hash > 0xffffffff
    ) {
      throw new TypeError('invalid CRDT sync reconciliation cell');
    }
  }
}

function cloneReconciliationCells(cells: readonly CrdtSyncReconciliationCell[]): CrdtSyncReconciliationCell[] {
  validateReconciliationCells(cells);
  const cloned = cells.map((cell) => ({
    actor: cell.actor,
    start: cell.start,
    end: cell.end,
    count: cell.count,
    hash: cell.hash
  }));
  cloned.sort(compareReconciliationCells);
  return cloned;
}

function normalizeActorRanges(ranges: readonly CrdtSyncActorRange[]): CrdtSyncActorRange[] {
  const sorted = ranges.map((range) => ({
    actor: range.actor,
    start: range.start,
    end: range.end
  }));
  sorted.sort(compareActorRanges);
  const out: CrdtSyncActorRange[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const range = sorted[i];
    const previous = out[out.length - 1];
    if (previous !== undefined && previous.actor === range.actor && range.start <= previous.end + 1) {
      if (range.end > previous.end) previous.end = range.end;
    } else {
      out[out.length] = range;
    }
  }
  return out;
}

function compareActorRanges(left: CrdtSyncActorRange, right: CrdtSyncActorRange): number {
  if (left.actor !== right.actor) return left.actor < right.actor ? -1 : 1;
  if (left.start !== right.start) return left.start - right.start;
  return left.end - right.end;
}

function compareReconciliationCells(left: CrdtSyncReconciliationCell, right: CrdtSyncReconciliationCell): number {
  if (left.actor !== right.actor) return left.actor < right.actor ? -1 : 1;
  if (left.start !== right.start) return left.start - right.start;
  return left.end - right.end;
}

function appendUrlParam(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined
): void {
  if (value === undefined || value === null) return;
  params.set(key, String(value));
}

function asUint8Array(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += base64Alphabet[(value >>> 18) & 63] +
      base64Alphabet[(value >>> 12) & 63] +
      base64Alphabet[(value >>> 6) & 63] +
      base64Alphabet[value & 63];
  }
  if (i < bytes.length) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const value = (b0 << 16) | (b1 << 8);
    out += base64Alphabet[(value >>> 18) & 63] +
      base64Alphabet[(value >>> 12) & 63] +
      (i + 1 < bytes.length ? base64Alphabet[(value >>> 6) & 63] : '=') +
      '=';
  }
  return out;
}

function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new TypeError('invalid base64 CRDT sync payload');
  let padding = 0;
  if (text.length !== 0 && text[text.length - 1] === '=') padding++;
  if (text.length > 1 && text[text.length - 2] === '=') padding++;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let outIndex = 0;
  for (let i = 0; i < text.length; i += 4) {
    const a = readBase64Char(text.charCodeAt(i));
    const b = readBase64Char(text.charCodeAt(i + 1));
    const c = text[i + 2] === '=' ? 0 : readBase64Char(text.charCodeAt(i + 2));
    const d = text[i + 3] === '=' ? 0 : readBase64Char(text.charCodeAt(i + 3));
    const value = (a << 18) | (b << 12) | (c << 6) | d;
    if (outIndex < out.length) out[outIndex++] = (value >>> 16) & 255;
    if (outIndex < out.length) out[outIndex++] = (value >>> 8) & 255;
    if (outIndex < out.length) out[outIndex++] = value & 255;
  }
  return out;
}

function createBase64Lookup(): Int16Array {
  const lookup = new Int16Array(128);
  lookup.fill(-1);
  for (let i = 0; i < base64Alphabet.length; i++) {
    lookup[base64Alphabet.charCodeAt(i)] = i;
  }
  return lookup;
}

function readBase64Char(code: number): number {
  if (code >= base64Lookup.length || base64Lookup[code] < 0) {
    throw new TypeError('invalid base64 CRDT sync payload');
  }
  return base64Lookup[code];
}
