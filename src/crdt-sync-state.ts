import {
  encodeCrdtUpdate,
  getCrdtUpdateActorRanges,
  getCrdtUpdateStateVector
} from '@shapeshift-labs/frontier-crdt/update';
import { cloneJson } from '@shapeshift-labs/frontier/clone';
import {
  assertPeerId,
  cloneActorRanges,
  cloneCrdtSyncMessage,
  cloneReconciliation,
  cloneStateVector,
  decodeCrdtSyncMessage,
  mergeStateVector,
  stateVectorHasChanges
} from './crdt-sync-wire.js';
import type { CrdtOperation, CrdtOperationId, JsonValue } from '@shapeshift-labs/frontier-crdt';
import type {
  CrdtCommitResult,
  CrdtDocument,
  CrdtStateVector,
  CrdtSyncActorRange,
  CrdtSyncEndpoint,
  CrdtSyncEndpointOptions,
  CrdtSyncGhostDelta,
  CrdtSyncGhostState,
  CrdtSyncGhostStateOptions,
  CrdtSyncMessage,
  CrdtSyncMessageInput,
  CrdtSyncPeerStates,
  CrdtSyncReconciliation,
  CrdtSyncReconciliationCell,
  CrdtSyncState,
  CrdtSyncStateOptions,
  CrdtUpdateInput
} from './types.js';

const CRDT_SYNC_EXACT_RANGE_LIMIT = 32;
const CRDT_SYNC_SKETCH_CELL_LIMIT = 128;
const CRDT_SYNC_MIN_SKETCH_BUCKET_SIZE = 4;

type SpanningCrdtOperation = Extract<CrdtOperation, { type: 'textRun' | 'listRun' | 'mapSetRun' }>;

export {
  createCrdtDocumentUrl,
  decodeCrdtSyncMessage,
  encodeCrdtSyncMessage,
  parseCrdtDocumentUrl
} from './crdt-sync-wire.js';

export function createCrdtSyncState(options?: CrdtSyncStateOptions): CrdtSyncState {
  return new FrontierCrdtSyncState(options);
}

export function createCrdtSyncEndpoint(doc: CrdtDocument, options?: CrdtSyncEndpointOptions): CrdtSyncEndpoint {
  return new FrontierCrdtSyncEndpoint(doc, options);
}

export function createCrdtSyncGhostState(options?: CrdtSyncGhostStateOptions): CrdtSyncGhostState {
  return new FrontierCrdtSyncGhostState(options);
}

export function unionCrdtSyncActorRanges(
  ...rangeSets: readonly (readonly CrdtSyncActorRange[])[]
): CrdtSyncActorRange[] {
  const ranges: CrdtSyncActorRange[] = [];
  for (let i = 0; i < rangeSets.length; i++) {
    const rangeSet = rangeSets[i];
    for (let j = 0; j < rangeSet.length; j++) ranges[ranges.length] = rangeSet[j];
  }
  return cloneActorRanges(ranges);
}

export function diffCrdtSyncActorRanges(
  source: readonly CrdtSyncActorRange[],
  known: readonly CrdtSyncActorRange[]
): CrdtSyncActorRange[] {
  return cloneActorRanges(diffActorRanges(cloneActorRanges(source), cloneActorRanges(known)));
}

class FrontierCrdtSyncState implements CrdtSyncState {
  private stateVector: CrdtStateVector = {};
  private actorRanges: CrdtSyncActorRange[] | null = null;
  private reconciliation: CrdtSyncReconciliation | null = null;
  private readonly actorRangeSync: boolean;
  private readonly documentId?: string;
  private readonly senderId?: string;

  constructor(options?: CrdtSyncStateOptions) {
    if (options && options.stateVector) this.stateVector = cloneStateVector(options.stateVector);
    this.actorRangeSync = !!options?.actorRangeSync;
    if (this.actorRangeSync) this.actorRanges = stateVectorToActorRanges(this.stateVector);
    this.documentId = options?.documentId;
    this.senderId = options?.senderId;
  }

  getStateVector(): CrdtStateVector {
    return cloneStateVector(this.stateVector);
  }

  setStateVector(stateVector?: CrdtStateVector | null): void {
    this.stateVector = stateVector ? cloneStateVector(stateVector) : {};
    this.reconciliation = null;
    if (this.actorRangeSync) this.actorRanges = stateVectorToActorRanges(this.stateVector);
  }

  updateStateVector(stateVector?: CrdtStateVector | null): CrdtStateVector {
    if (stateVector) mergeStateVector(this.stateVector, stateVector);
    if (this.actorRangeSync && stateVector) {
      this.reconciliation = null;
      this.mergeActorRanges(stateVectorToActorRanges(stateVector));
    }
    return this.getStateVector();
  }

  hasChanges(doc: CrdtDocument): boolean {
    if (this.actorRangeSync && this.reconciliation !== null) {
      return reconciliationHasChanges(doc, this.reconciliation, this.stateVector);
    }
    if (this.actorRangeSync && this.actorRanges !== null) {
      return getMissingActorRangesForDocument(doc, this.actorRanges).length !== 0;
    }
    return stateVectorHasChanges(doc.getStateVector(), this.stateVector);
  }

  encodeUpdate(doc: CrdtDocument): Uint8Array {
    if (this.actorRangeSync && this.reconciliation !== null) {
      return encodeUpdateSinceReconciliation(doc, this.reconciliation, this.stateVector);
    }
    if (this.actorRangeSync && this.actorRanges !== null) {
      return encodeUpdateSinceActorRanges(doc, this.actorRanges);
    }
    return doc.encodeStateAsUpdate(this.stateVector);
  }

  markUpdateKnown(update: CrdtUpdateInput): CrdtStateVector {
    mergeStateVector(this.stateVector, getCrdtUpdateStateVector(update));
    if (this.actorRangeSync) {
      this.reconciliation = null;
      this.mergeActorRanges(getCrdtUpdateActorRanges(update));
    }
    return this.getStateVector();
  }

  markDocumentSynced(doc: CrdtDocument): CrdtStateVector {
    this.stateVector = doc.getStateVector();
    if (this.actorRangeSync) {
      this.actorRanges = getDocumentActorRanges(doc);
      this.reconciliation = null;
    }
    return this.getStateVector();
  }

  applyUpdate(doc: CrdtDocument, update: CrdtUpdateInput): CrdtCommitResult {
    const result = doc.applyUpdate(update);
    this.markUpdateKnown(update);
    return result;
  }

  createStateVectorMessage(doc: CrdtDocument): CrdtSyncMessage {
    return this.withActorRanges(doc, this.withEnvelope({
      type: 'state-vector',
      stateVector: doc.getStateVector()
    }));
  }

  createUpdateMessage(doc: CrdtDocument): CrdtSyncMessage {
    return this.withEnvelope({
      type: 'update',
      stateVector: doc.getStateVector(),
      update: this.encodeUpdate(doc)
    });
  }

  createAckMessage(doc: CrdtDocument): CrdtSyncMessage {
    return this.withActorRanges(doc, this.withEnvelope({
      type: 'ack',
      stateVector: doc.getStateVector()
    }));
  }

  receiveMessage(doc: CrdtDocument, message: CrdtSyncMessageInput): CrdtSyncMessage | undefined {
    return this.receiveDecodedMessage(doc, decodeCrdtSyncMessage(message));
  }

  receiveDecodedMessage(doc: CrdtDocument, decoded: CrdtSyncMessage): CrdtSyncMessage | undefined {
    if (decoded.type === 'state-vector') {
      this.setStateVector(decoded.stateVector);
      this.replaceActorRangesFromMessage(decoded);
      return this.hasChanges(doc) ? this.createUpdateMessage(doc) : this.createAckMessage(doc);
    }
    if (decoded.type === 'update') {
      if (decoded.update === undefined) throw new TypeError('CRDT sync update message is missing update bytes');
      this.applyUpdate(doc, decoded.update);
      this.updateStateVector(decoded.stateVector);
      this.mergeActorRangesFromMessage(decoded);
      return this.hasChanges(doc) ? this.createUpdateMessage(doc) : this.createAckMessage(doc);
    }
    this.updateStateVector(decoded.stateVector);
    this.mergeActorRangesFromMessage(decoded);
    return this.hasChanges(doc) ? this.createUpdateMessage(doc) : undefined;
  }

  private replaceActorRangesFromMessage(message: CrdtSyncMessage): void {
    if (!this.actorRangeSync) return;
    if (message.actorRanges !== undefined) {
      this.actorRanges = cloneActorRanges(message.actorRanges);
      this.reconciliation = null;
      return;
    }
    if (message.reconciliation !== undefined) {
      this.actorRanges = null;
      this.reconciliation = cloneReconciliation(message.reconciliation);
      return;
    }
    this.actorRanges = stateVectorToActorRanges(message.stateVector);
    this.reconciliation = null;
  }

  private mergeActorRangesFromMessage(message: CrdtSyncMessage): void {
    if (!this.actorRangeSync) return;
    if (message.actorRanges !== undefined) {
      this.reconciliation = null;
      this.mergeActorRanges(message.actorRanges);
      return;
    }
    if (message.reconciliation !== undefined) {
      this.actorRanges = null;
      this.reconciliation = cloneReconciliation(message.reconciliation);
      return;
    }
    this.reconciliation = null;
    this.mergeActorRanges(stateVectorToActorRanges(message.stateVector));
  }

  private mergeActorRanges(ranges: readonly CrdtSyncActorRange[]): void {
    this.actorRanges = mergeActorRanges(this.actorRanges || [], ranges);
  }

  private withEnvelope(message: CrdtSyncMessage): CrdtSyncMessage {
    if (this.documentId !== undefined) message.documentId = this.documentId;
    if (this.senderId !== undefined) message.senderId = this.senderId;
    return message;
  }

  private withActorRanges(doc: CrdtDocument, message: CrdtSyncMessage): CrdtSyncMessage {
    if (this.actorRangeSync) attachSyncSummary(doc, message);
    return message;
  }
}

class FrontierCrdtSyncEndpoint implements CrdtSyncEndpoint {
  readonly documentId?: string;
  readonly peerId?: string;
  private readonly actorRangeSync: boolean;
  private readonly peers = new Map<string, FrontierCrdtSyncState>();

  constructor(readonly doc: CrdtDocument, options?: CrdtSyncEndpointOptions) {
    this.documentId = options?.documentId;
    this.peerId = options?.senderId;
    this.actorRangeSync = !!options?.actorRangeSync;
    if (options?.peers) this.setPeerStateVectors(options.peers);
  }

  getPeerIds(): string[] {
    return Array.from(this.peers.keys()).sort();
  }

  getPeerStateVectors(): CrdtSyncPeerStates {
    const out: CrdtSyncPeerStates = {};
    const peerIds = this.getPeerIds();
    for (let i = 0; i < peerIds.length; i++) {
      const peerId = peerIds[i];
      out[peerId] = this.getPeerState(peerId).getStateVector();
    }
    return out;
  }

  setPeerStateVectors(peers?: CrdtSyncPeerStates | null): void {
    this.peers.clear();
    if (peers === undefined || peers === null) return;
    const peerIds = Object.keys(peers).sort();
    for (let i = 0; i < peerIds.length; i++) {
      const peerId = peerIds[i];
      assertPeerId(peerId);
      this.peers.set(peerId, new FrontierCrdtSyncState({
        documentId: this.documentId,
        senderId: this.peerId,
        actorRangeSync: this.actorRangeSync,
        stateVector: peers[peerId]
      }));
    }
  }

  getPeerState(peerId: string): CrdtSyncState {
    return this.getPeerSyncState(peerId);
  }

  private getPeerSyncState(peerId: string): FrontierCrdtSyncState {
    assertPeerId(peerId);
    let state = this.peers.get(peerId);
    if (state === undefined) {
      state = new FrontierCrdtSyncState({
        documentId: this.documentId,
        senderId: this.peerId,
        actorRangeSync: this.actorRangeSync
      });
      this.peers.set(peerId, state);
    }
    return state;
  }

  getPeerStateVector(peerId: string): CrdtStateVector {
    return this.getPeerState(peerId).getStateVector();
  }

  setPeerStateVector(peerId: string, stateVector?: CrdtStateVector | null): void {
    this.getPeerState(peerId).setStateVector(stateVector);
  }

  markPeerSynced(peerId: string): CrdtStateVector {
    return this.getPeerState(peerId).markDocumentSynced(this.doc);
  }

  deletePeer(peerId: string): boolean {
    assertPeerId(peerId);
    return this.peers.delete(peerId);
  }

  open(peerId: string): CrdtSyncMessage {
    return this.getPeerState(peerId).createStateVectorMessage(this.doc);
  }

  createUpdate(peerId: string): CrdtSyncMessage {
    return this.getPeerState(peerId).createUpdateMessage(this.doc);
  }

  receive(message: CrdtSyncMessageInput): CrdtSyncMessage | undefined;
  receive(peerId: string, message: CrdtSyncMessageInput): CrdtSyncMessage | undefined;
  receive(peerIdOrMessage: string | CrdtSyncMessageInput, maybeMessage?: CrdtSyncMessageInput): CrdtSyncMessage | undefined {
    const decoded = decodeCrdtSyncMessage(maybeMessage === undefined ? peerIdOrMessage as CrdtSyncMessageInput : maybeMessage);
    if (this.documentId !== undefined && decoded.documentId !== undefined && decoded.documentId !== this.documentId) {
      throw new TypeError('CRDT sync message belongs to a different document');
    }
    const peerId = maybeMessage === undefined ? decoded.senderId : peerIdOrMessage as string;
    if (peerId === undefined) throw new TypeError('CRDT sync message is missing senderId');
    const reply = this.getPeerSyncState(peerId).receiveDecodedMessage(this.doc, decoded);
    return reply === undefined ? undefined : cloneCrdtSyncMessage(reply);
  }
}

class FrontierCrdtSyncGhostState implements CrdtSyncGhostState {
  private ackedRanges: CrdtSyncActorRange[] = [];
  private ghostRanges: CrdtSyncActorRange[] = [];
  private pendingRanges: CrdtSyncActorRange[] = [];

  constructor(options?: CrdtSyncGhostStateOptions) {
    this.reset(options);
  }

  getAckedActorRanges(): CrdtSyncActorRange[] {
    return cloneActorRanges(this.ackedRanges);
  }

  getGhostActorRanges(): CrdtSyncActorRange[] {
    return cloneActorRanges(this.ghostRanges);
  }

  getPendingActorRanges(): CrdtSyncActorRange[] {
    return cloneActorRanges(this.pendingRanges);
  }

  reset(options?: CrdtSyncGhostStateOptions | null): void {
    const acked = readGhostOptionRanges(options);
    this.ackedRanges = acked;
    this.ghostRanges = options?.ghostRanges === undefined || options.ghostRanges === null
      ? cloneActorRanges(acked)
      : unionCrdtSyncActorRanges(acked, options.ghostRanges);
    this.pendingRanges = options?.pendingRanges === undefined || options.pendingRanges === null
      ? diffActorRanges(this.ghostRanges, this.ackedRanges)
      : cloneActorRanges(options.pendingRanges);
  }

  markAcked(ranges?: readonly CrdtSyncActorRange[] | CrdtStateVector | null): CrdtSyncActorRange[] {
    const acked = ranges === undefined || ranges === null
      ? this.ghostRanges
      : actorRangesFromRangesOrVector(ranges);
    this.ackedRanges = unionCrdtSyncActorRanges(this.ackedRanges, acked);
    this.ghostRanges = unionCrdtSyncActorRanges(this.ghostRanges, this.ackedRanges);
    this.pendingRanges = diffActorRanges(this.pendingRanges, this.ackedRanges);
    return this.getAckedActorRanges();
  }

  markUpdateAcked(update: CrdtUpdateInput): CrdtSyncActorRange[] {
    return this.markAcked(getCrdtUpdateActorRanges(update));
  }

  markDocumentAcked(doc: CrdtDocument): CrdtSyncActorRange[] {
    const ranges = getDocumentActorRanges(doc);
    this.ackedRanges = ranges;
    this.ghostRanges = cloneActorRanges(ranges);
    this.pendingRanges = [];
    return this.getAckedActorRanges();
  }

  createDelta(doc: CrdtDocument): CrdtSyncGhostDelta | undefined {
    return this.createDeltaFromBasis(doc, this.ghostRanges, false);
  }

  createRepairDelta(doc: CrdtDocument): CrdtSyncGhostDelta | undefined {
    return this.createDeltaFromBasis(doc, this.ackedRanges, true);
  }

  private createDeltaFromBasis(
    doc: CrdtDocument,
    basis: readonly CrdtSyncActorRange[],
    repair: boolean
  ): CrdtSyncGhostDelta | undefined {
    const targetRanges = getDocumentActorRanges(doc);
    const basisRanges = cloneActorRanges(basis);
    const missing = diffActorRanges(targetRanges, basisRanges);
    if (missing.length === 0) return undefined;
    const update = encodeUpdateForMissingActorRanges(doc, missing);
    this.ghostRanges = unionCrdtSyncActorRanges(this.ghostRanges, missing);
    this.pendingRanges = repair
      ? diffActorRanges(targetRanges, this.ackedRanges)
      : unionCrdtSyncActorRanges(this.pendingRanges, missing);
    return {
      update,
      ranges: cloneActorRanges(missing),
      basisRanges,
      targetRanges,
      stateVector: doc.getStateVector()
    };
  }
}

function getDocumentActorRanges(doc: CrdtDocument): CrdtSyncActorRange[] {
  return cloneActorRanges(getCrdtUpdateActorRanges(doc.exportUpdate({})));
}

function attachSyncSummary(doc: CrdtDocument, message: CrdtSyncMessage): void {
  const ranges = getDocumentActorRanges(doc);
  if (actorRangesEqualStateVector(ranges, message.stateVector)) return;
  if (ranges.length <= CRDT_SYNC_EXACT_RANGE_LIMIT) {
    message.actorRanges = ranges;
    return;
  }
  message.reconciliation = createReconciliationSummary(ranges);
}

function stateVectorToActorRanges(stateVector: CrdtStateVector): CrdtSyncActorRange[] {
  const ranges: CrdtSyncActorRange[] = [];
  for (const actor in stateVector) {
    const seq = stateVector[actor];
    if (seq > 0) ranges[ranges.length] = { actor, start: 1, end: seq };
  }
  return cloneActorRanges(ranges);
}

function readGhostOptionRanges(options?: CrdtSyncGhostStateOptions | null): CrdtSyncActorRange[] {
  const ranges: CrdtSyncActorRange[][] = [];
  if (options?.stateVector) ranges[ranges.length] = stateVectorToActorRanges(options.stateVector);
  if (options?.ackedRanges) ranges[ranges.length] = options.ackedRanges;
  return unionCrdtSyncActorRanges(...ranges);
}

function actorRangesFromRangesOrVector(
  input: readonly CrdtSyncActorRange[] | CrdtStateVector
): CrdtSyncActorRange[] {
  return Array.isArray(input)
    ? cloneActorRanges(input)
    : stateVectorToActorRanges(input as CrdtStateVector);
}

function actorRangesEqualStateVector(
  ranges: readonly CrdtSyncActorRange[],
  stateVector: CrdtStateVector
): boolean {
  const contiguous = stateVectorToActorRanges(stateVector);
  if (ranges.length !== contiguous.length) return false;
  const normalized = cloneActorRanges(ranges);
  for (let i = 0; i < contiguous.length; i++) {
    if (
      normalized[i].actor !== contiguous[i].actor ||
      normalized[i].start !== contiguous[i].start ||
      normalized[i].end !== contiguous[i].end
    ) {
      return false;
    }
  }
  return true;
}

function mergeActorRanges(
  left: readonly CrdtSyncActorRange[],
  right: readonly CrdtSyncActorRange[]
): CrdtSyncActorRange[] {
  return cloneActorRanges([...left, ...right]);
}

function encodeUpdateSinceActorRanges(doc: CrdtDocument, known: readonly CrdtSyncActorRange[]): Uint8Array {
  const missing = getMissingActorRangesForDocument(doc, known);
  if (missing.length === 0) return doc.encodeStateAsUpdate(doc.getStateVector());
  return encodeUpdateForMissingActorRanges(doc, missing);
}

function reconciliationHasChanges(
  doc: CrdtDocument,
  reconciliation: CrdtSyncReconciliation,
  knownVector: CrdtStateVector
): boolean {
  return getMissingReconciliationRangesForDocument(doc, reconciliation, knownVector).length !== 0;
}

function encodeUpdateSinceReconciliation(
  doc: CrdtDocument,
  reconciliation: CrdtSyncReconciliation,
  knownVector: CrdtStateVector
): Uint8Array {
  const missing = getMissingReconciliationRangesForDocument(doc, reconciliation, knownVector);
  if (missing.length === 0) return doc.encodeStateAsUpdate(doc.getStateVector());
  return encodeUpdateForMissingActorRanges(doc, missing);
}

function encodeUpdateForMissingActorRanges(
  doc: CrdtDocument,
  missing: readonly CrdtSyncActorRange[]
): Uint8Array {
  if (missing.length === 1) {
    const range = missing[0];
    return doc.exportChangesBetween(
      [range.actor + ':' + (range.start - 1)],
      [range.actor + ':' + range.end]
    );
  }
  const ops = collectOperationsForActorRanges(doc.changesBetween(
    actorRangeStartVector(missing),
    actorRangeEndVersion(missing)
  ), missing);
  if (ops.length === 0) return doc.encodeStateAsUpdate(doc.getStateVector());
  return encodeCrdtUpdate({
    actor: doc.actorId,
    seq: maxOperationSeq(ops),
    deps: getHeadsFromOperationList(ops),
    ops
  });
}

function actorRangeStartVector(ranges: readonly CrdtSyncActorRange[]): CrdtStateVector {
  const vector: CrdtStateVector = {};
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const seq = range.start - 1;
    if (vector[range.actor] === undefined || seq < vector[range.actor]) vector[range.actor] = seq;
  }
  return vector;
}

function actorRangeEndVersion(ranges: readonly CrdtSyncActorRange[]): CrdtOperationId[] {
  const maxes = actorRangesToMaxVector(ranges);
  const actors = Object.keys(maxes).sort();
  const version = new Array<CrdtOperationId>(actors.length);
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    version[i] = actor + ':' + maxes[actor];
  }
  return version;
}

function collectOperationsForActorRanges(
  ops: readonly CrdtOperation[],
  ranges: readonly CrdtSyncActorRange[]
): CrdtOperation[] {
  const rangesByActor = groupActorRanges(ranges);
  const out: CrdtOperation[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const actorRanges = rangesByActor.get(op.actor);
    if (actorRanges === undefined) continue;
    appendOperationRangeSlices(out, op, actorRanges);
  }
  return out;
}

function groupActorRanges(ranges: readonly CrdtSyncActorRange[]): Map<string, CrdtSyncActorRange[]> {
  const out = new Map<string, CrdtSyncActorRange[]>();
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    let actorRanges = out.get(range.actor);
    if (actorRanges === undefined) {
      actorRanges = [];
      out.set(range.actor, actorRanges);
    }
    actorRanges[actorRanges.length] = range;
  }
  out.forEach((actorRanges) => {
    actorRanges.sort((left, right) => left.start - right.start || left.end - right.end);
  });
  return out;
}

function appendOperationRangeSlices(
  out: CrdtOperation[],
  op: CrdtOperation,
  ranges: readonly CrdtSyncActorRange[]
): void {
  const endSeq = operationEndSeq(op);
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.end < op.seq) continue;
    if (range.start > endSeq) break;
    const sliced = sliceOperationToRange(op, Math.max(op.seq, range.start), Math.min(endSeq, range.end));
    if (sliced !== null) out[out.length] = sliced;
  }
}

function sliceOperationToRange(op: CrdtOperation, startSeq: number, endSeq: number): CrdtOperation | null {
  if (endSeq < startSeq) return null;
  if (!isSpanningOperation(op)) return op.seq >= startSeq && op.seq <= endSeq ? cloneCrdtOperation(op) : null;
  if (op.type === 'textRun') return textRunRangeSlice(op, startSeq, endSeq);
  if (op.type === 'listRun') return listRunRangeSlice(op, startSeq, endSeq);
  return mapSetRunRangeSlice(op, startSeq, endSeq);
}

function textRunRangeSlice(
  op: Extract<CrdtOperation, { type: 'textRun' }>,
  startSeq: number,
  endSeq: number
): CrdtOperation | null {
  const count = Math.min(endSeq, operationEndSeq(op)) - startSeq + 1;
  if (count <= 0) return null;
  const offset = startSeq - op.seq;
  const text = Array.from(op.text).slice(offset, offset + count).join('');
  const id = offset === 0 ? op.id : op.actor + ':' + startSeq;
  const deps = offset === 0 ? op.deps.slice() : [op.actor + ':' + (startSeq - 1)];
  const after = offset === 0 ? op.after : op.actor + ':' + (startSeq - 1) + '/0';
  return count === 1
    ? { type: 'textInsert', id, actor: op.actor, seq: startSeq, deps, path: op.path.slice(), after, text }
    : { type: 'textRun', id, actor: op.actor, seq: startSeq, deps, path: op.path.slice(), after, text, count };
}

function listRunRangeSlice(
  op: Extract<CrdtOperation, { type: 'listRun' }>,
  startSeq: number,
  endSeq: number
): CrdtOperation | null {
  const count = Math.min(endSeq, operationEndSeq(op)) - startSeq + 1;
  if (count <= 0) return null;
  const offset = startSeq - op.seq;
  const values = cloneJson(op.values.slice(offset, offset + count) as unknown as JsonValue) as unknown as JsonValue[];
  const id = offset === 0 ? op.id : op.actor + ':' + startSeq;
  const deps = offset === 0 ? op.deps.slice() : [op.actor + ':' + (startSeq - 1)];
  const after = offset === 0 ? op.after : op.actor + ':' + (startSeq - 1) + '/0';
  return count === 1
    ? { type: 'listInsert', id, actor: op.actor, seq: startSeq, deps, path: op.path.slice(), after, values }
    : { type: 'listRun', id, actor: op.actor, seq: startSeq, deps, path: op.path.slice(), after, values, count };
}

function mapSetRunRangeSlice(
  op: Extract<CrdtOperation, { type: 'mapSetRun' }>,
  startSeq: number,
  endSeq: number
): CrdtOperation | null {
  const count = Math.min(endSeq, operationEndSeq(op)) - startSeq + 1;
  if (count <= 0) return null;
  const offset = startSeq - op.seq;
  const keys = op.keys.slice(offset, offset + count);
  const values = cloneJson(op.values.slice(offset, offset + count) as unknown as JsonValue) as unknown as JsonValue[];
  const id = offset === 0 ? op.id : op.actor + ':' + startSeq;
  const deps = offset === 0 ? op.deps.slice() : [op.actor + ':' + (startSeq - 1)];
  return count === 1
    ? { type: 'set', id, actor: op.actor, seq: startSeq, deps, path: op.path.concat(keys[0]), value: cloneJson(values[0]) }
    : { type: 'mapSetRun', id, actor: op.actor, seq: startSeq, deps, path: op.path.slice(), keys, values, count };
}

function isSpanningOperation(op: CrdtOperation): op is SpanningCrdtOperation {
  return op.type === 'textRun' || op.type === 'listRun' || op.type === 'mapSetRun';
}

function operationSeqSpan(op: CrdtOperation): number {
  return isSpanningOperation(op) ? op.count : 1;
}

function operationEndSeq(op: CrdtOperation): number {
  return op.seq + operationSeqSpan(op) - 1;
}

function operationHeadId(op: CrdtOperation): string {
  return isSpanningOperation(op) ? op.actor + ':' + operationEndSeq(op) : op.id;
}

function maxOperationSeq(ops: readonly CrdtOperation[]): number {
  let max = 0;
  for (let i = 0; i < ops.length; i++) {
    const end = operationEndSeq(ops[i]);
    if (end > max) max = end;
  }
  return max;
}

function getHeadsFromOperationList(ops: readonly CrdtOperation[]): CrdtOperationId[] {
  const referenced = new Set<string>();
  for (let i = 0; i < ops.length; i++) {
    const deps = ops[i].deps;
    for (let j = 0; j < deps.length; j++) referenced.add(deps[j]);
  }
  const heads: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    const head = operationHeadId(ops[i]);
    if (!referenced.has(head)) heads[heads.length] = head;
  }
  heads.sort(compareOperationIds);
  return heads;
}

function cloneCrdtOperation(op: CrdtOperation): CrdtOperation {
  return cloneJson(op as unknown as JsonValue) as unknown as CrdtOperation;
}

function compareOperationIds(left: string, right: string): number {
  const leftIndex = left.lastIndexOf(':');
  const rightIndex = right.lastIndexOf(':');
  if (leftIndex === -1 || rightIndex === -1) return left < right ? -1 : left > right ? 1 : 0;
  const leftActor = left.slice(0, leftIndex);
  const rightActor = right.slice(0, rightIndex);
  if (leftActor < rightActor) return -1;
  if (leftActor > rightActor) return 1;
  return Number(left.slice(leftIndex + 1)) - Number(right.slice(rightIndex + 1));
}

function diffReconciliationRanges(
  source: readonly CrdtSyncActorRange[],
  reconciliation: CrdtSyncReconciliation,
  knownVector: CrdtStateVector
): CrdtSyncActorRange[] {
  const cells = new Map<string, CrdtSyncReconciliationCell>();
  for (let i = 0; i < reconciliation.cells.length; i++) {
    const cell = reconciliation.cells[i];
    cells.set(reconciliationCellKey(cell.actor, cell.start, cell.end), cell);
  }
  const missing: CrdtSyncActorRange[] = [];
  const cellMaxes = getReconciliationActorMaxes(reconciliation);
  for (let i = 0; i < source.length; i++) {
    const range = source[i];
    const knownEnd = cellMaxes[range.actor] || knownVector[range.actor] || 0;
    const comparableEnd = Math.min(range.end, knownEnd);
    for (let start = range.start; start <= comparableEnd; start += reconciliation.bucketSize) {
      const end = Math.min(comparableEnd, start + reconciliation.bucketSize - 1);
      const remote = cells.get(reconciliationCellKey(range.actor, start, end));
      const local = digestActorCoverage(source, range.actor, start, end);
      if (
        remote === undefined ||
        remote.count !== local.count ||
        remote.hash !== local.hash
      ) {
        missing[missing.length] = { actor: range.actor, start, end };
      }
    }
    if (range.end > knownEnd) {
      missing[missing.length] = { actor: range.actor, start: Math.max(range.start, knownEnd + 1), end: range.end };
    }
  }
  return cloneActorRanges(missing);
}

function getMissingActorRangesForDocument(
  doc: CrdtDocument,
  known: readonly CrdtSyncActorRange[]
): CrdtSyncActorRange[] {
  const stateVector = doc.getStateVector();
  const contiguous = stateVectorToActorRanges(stateVector);
  const missing = diffActorRanges(contiguous, known);
  if (missing.length !== 0 || stateVectorCovers(stateVector, actorRangesToMaxVector(known))) return missing;
  return diffActorRanges(getDocumentActorRanges(doc), known);
}

function getMissingReconciliationRangesForDocument(
  doc: CrdtDocument,
  reconciliation: CrdtSyncReconciliation,
  knownVector: CrdtStateVector
): CrdtSyncActorRange[] {
  const stateVector = doc.getStateVector();
  const contiguous = stateVectorToActorRanges(stateVector);
  const missing = diffReconciliationRanges(contiguous, reconciliation, knownVector);
  if (missing.length !== 0 || stateVectorCovers(stateVector, getReconciliationActorMaxes(reconciliation))) {
    return missing;
  }
  return diffReconciliationRanges(getDocumentActorRanges(doc), reconciliation, knownVector);
}

function diffActorRanges(
  source: readonly CrdtSyncActorRange[],
  known: readonly CrdtSyncActorRange[]
): CrdtSyncActorRange[] {
  const missing: CrdtSyncActorRange[] = [];
  for (let i = 0; i < source.length; i++) {
    const sourceRange = source[i];
    let cursor = sourceRange.start;
    for (let j = 0; j < known.length && cursor <= sourceRange.end; j++) {
      const knownRange = known[j];
      if (knownRange.actor !== sourceRange.actor) continue;
      if (knownRange.end < cursor) continue;
      if (knownRange.start > sourceRange.end) break;
      if (knownRange.start > cursor) {
        missing[missing.length] = {
          actor: sourceRange.actor,
          start: cursor,
          end: Math.min(sourceRange.end, knownRange.start - 1)
        };
      }
      if (knownRange.end >= cursor) cursor = knownRange.end + 1;
    }
    if (cursor <= sourceRange.end) {
      missing[missing.length] = {
        actor: sourceRange.actor,
        start: cursor,
        end: sourceRange.end
      };
    }
  }
  return missing;
}

function createReconciliationSummary(ranges: readonly CrdtSyncActorRange[]): CrdtSyncReconciliation {
  const rangeVector = actorRangesToMaxVector(ranges);
  const bucketSize = chooseReconciliationBucketSize(rangeVector);
  const actors = Object.keys(rangeVector).sort();
  const cells: CrdtSyncReconciliationCell[] = [];
  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    const maxSeq = rangeVector[actor] || 0;
    for (let start = 1; start <= maxSeq; start += bucketSize) {
      const end = Math.min(maxSeq, start + bucketSize - 1);
      const digest = digestActorCoverage(ranges, actor, start, end);
      cells[cells.length] = { actor, start, end, count: digest.count, hash: digest.hash };
    }
  }
  return {
    version: 1,
    strategy: 'merkle-iblt',
    bucketSize,
    rangeCount: ranges.length,
    opCount: countActorRangeOps(ranges),
    cells
  };
}

function getReconciliationActorMaxes(reconciliation: CrdtSyncReconciliation): CrdtStateVector {
  const out: CrdtStateVector = {};
  for (let i = 0; i < reconciliation.cells.length; i++) {
    const cell = reconciliation.cells[i];
    if (cell.end > (out[cell.actor] || 0)) out[cell.actor] = cell.end;
  }
  return out;
}

function actorRangesToMaxVector(ranges: readonly CrdtSyncActorRange[]): CrdtStateVector {
  const out: CrdtStateVector = {};
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.end > (out[range.actor] || 0)) out[range.actor] = range.end;
  }
  return out;
}

function stateVectorCovers(vector: CrdtStateVector, maxes: CrdtStateVector): boolean {
  for (const actor in maxes) {
    if ((vector[actor] || 0) < maxes[actor]) return false;
  }
  return true;
}

function chooseReconciliationBucketSize(stateVector: CrdtStateVector): number {
  let bucketSize = CRDT_SYNC_MIN_SKETCH_BUCKET_SIZE;
  while (countReconciliationCells(stateVector, bucketSize) > CRDT_SYNC_SKETCH_CELL_LIMIT) {
    bucketSize *= 2;
  }
  return bucketSize;
}

function countReconciliationCells(stateVector: CrdtStateVector, bucketSize: number): number {
  let count = 0;
  for (const actor in stateVector) {
    const seq = stateVector[actor];
    if (seq > 0) count += Math.ceil(seq / bucketSize);
  }
  return count;
}

function countActorRangeOps(ranges: readonly CrdtSyncActorRange[]): number {
  let count = 0;
  for (let i = 0; i < ranges.length; i++) count += ranges[i].end - ranges[i].start + 1;
  return count;
}

function digestActorCoverage(
  ranges: readonly CrdtSyncActorRange[],
  actor: string,
  start: number,
  end: number
): { count: number; hash: number } {
  let count = 0;
  let hash = 0;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.actor !== actor || range.end < start) continue;
    if (range.start > end) break;
    const from = Math.max(start, range.start);
    const to = Math.min(end, range.end);
    for (let seq = from; seq <= to; seq++) {
      count++;
      hash = (hash + hashActorSeq(actor, seq)) >>> 0;
    }
  }
  return { count, hash };
}

function hashActorSeq(actor: string, seq: number): number {
  let hash = 2166136261;
  for (let i = 0; i < actor.length; i++) {
    hash ^= actor.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= seq;
  hash = Math.imul(hash, 2246822519);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489917);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function reconciliationCellKey(actor: string, start: number, end: number): string {
  return actor + ':' + start + '-' + end;
}
