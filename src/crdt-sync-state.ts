import {
  getCrdtUpdateActorRanges,
  getCrdtUpdateStateVector,
  mergeCrdtUpdates
} from '@shapeshift-labs/frontier-crdt/update';
import {
  assertPeerId,
  cloneActorRanges,
  cloneCrdtSyncMessage,
  cloneStateVector,
  decodeCrdtSyncMessage,
  mergeStateVector,
  stateVectorHasChanges
} from './crdt-sync-wire.js';
import type {
  CrdtCommitResult,
  CrdtDocument,
  CrdtStateVector,
  CrdtSyncActorRange,
  CrdtSyncEndpoint,
  CrdtSyncEndpointOptions,
  CrdtSyncMessage,
  CrdtSyncMessageInput,
  CrdtSyncPeerStates,
  CrdtSyncState,
  CrdtSyncStateOptions,
  CrdtUpdateInput
} from './types.js';

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

class FrontierCrdtSyncState implements CrdtSyncState {
  private stateVector: CrdtStateVector = {};
  private actorRanges: CrdtSyncActorRange[] | null = null;
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
    if (this.actorRangeSync) this.actorRanges = stateVectorToActorRanges(this.stateVector);
  }

  updateStateVector(stateVector?: CrdtStateVector | null): CrdtStateVector {
    if (stateVector) mergeStateVector(this.stateVector, stateVector);
    if (this.actorRangeSync && stateVector) this.mergeActorRanges(stateVectorToActorRanges(stateVector));
    return this.getStateVector();
  }

  hasChanges(doc: CrdtDocument): boolean {
    if (this.actorRangeSync && this.actorRanges !== null) {
      return actorRangesHaveChanges(getDocumentContiguousActorRanges(doc), this.actorRanges);
    }
    return stateVectorHasChanges(doc.getStateVector(), this.stateVector);
  }

  encodeUpdate(doc: CrdtDocument): Uint8Array {
    if (this.actorRangeSync && this.actorRanges !== null) {
      return encodeUpdateSinceActorRanges(doc, this.actorRanges);
    }
    return doc.encodeStateAsUpdate(this.stateVector);
  }

  markUpdateKnown(update: CrdtUpdateInput): CrdtStateVector {
    mergeStateVector(this.stateVector, getCrdtUpdateStateVector(update));
    if (this.actorRangeSync) this.mergeActorRanges(getCrdtUpdateActorRanges(update));
    return this.getStateVector();
  }

  markDocumentSynced(doc: CrdtDocument): CrdtStateVector {
    this.stateVector = doc.getStateVector();
    if (this.actorRangeSync) this.actorRanges = getDocumentActorRanges(doc);
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
    const decoded = decodeCrdtSyncMessage(message);
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
    this.actorRanges = message.actorRanges === undefined
      ? stateVectorToActorRanges(message.stateVector)
      : cloneActorRanges(message.actorRanges);
  }

  private mergeActorRangesFromMessage(message: CrdtSyncMessage): void {
    if (!this.actorRangeSync) return;
    this.mergeActorRanges(message.actorRanges === undefined
      ? stateVectorToActorRanges(message.stateVector)
      : message.actorRanges);
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
    if (this.actorRangeSync) message.actorRanges = getDocumentActorRanges(doc);
    return message;
  }
}

class FrontierCrdtSyncEndpoint implements CrdtSyncEndpoint {
  readonly documentId?: string;
  readonly peerId?: string;
  private readonly actorRangeSync: boolean;
  private readonly peers = new Map<string, CrdtSyncState>();

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
      this.peers.set(peerId, createCrdtSyncState({
        documentId: this.documentId,
        senderId: this.peerId,
        actorRangeSync: this.actorRangeSync,
        stateVector: peers[peerId]
      }));
    }
  }

  getPeerState(peerId: string): CrdtSyncState {
    assertPeerId(peerId);
    let state = this.peers.get(peerId);
    if (state === undefined) {
      state = createCrdtSyncState({
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
    const reply = this.getPeerState(peerId).receiveMessage(this.doc, decoded);
    return reply === undefined ? undefined : cloneCrdtSyncMessage(reply);
  }
}

function getDocumentActorRanges(doc: CrdtDocument): CrdtSyncActorRange[] {
  return cloneActorRanges(getCrdtUpdateActorRanges(doc.exportUpdate({})));
}

function getDocumentContiguousActorRanges(doc: CrdtDocument): CrdtSyncActorRange[] {
  return stateVectorToActorRanges(doc.getStateVector());
}

function stateVectorToActorRanges(stateVector: CrdtStateVector): CrdtSyncActorRange[] {
  const ranges: CrdtSyncActorRange[] = [];
  for (const actor in stateVector) {
    const seq = stateVector[actor];
    if (seq > 0) ranges[ranges.length] = { actor, start: 1, end: seq };
  }
  return cloneActorRanges(ranges);
}

function mergeActorRanges(
  left: readonly CrdtSyncActorRange[],
  right: readonly CrdtSyncActorRange[]
): CrdtSyncActorRange[] {
  return cloneActorRanges([...left, ...right]);
}

function actorRangesHaveChanges(
  source: readonly CrdtSyncActorRange[],
  known: readonly CrdtSyncActorRange[]
): boolean {
  for (let i = 0; i < source.length; i++) {
    const range = source[i];
    if (!actorRangesCover(known, range.actor, range.start, range.end)) return true;
  }
  return false;
}

function encodeUpdateSinceActorRanges(doc: CrdtDocument, known: readonly CrdtSyncActorRange[]): Uint8Array {
  const missing = diffActorRanges(getDocumentContiguousActorRanges(doc), known);
  if (missing.length === 0) return doc.encodeStateAsUpdate(doc.getStateVector());
  const updates = new Array<Uint8Array>(missing.length);
  for (let i = 0; i < missing.length; i++) {
    const range = missing[i];
    updates[i] = doc.exportChangesBetween(
      [range.actor + ':' + (range.start - 1)],
      [range.actor + ':' + range.end]
    );
  }
  return updates.length === 1 ? updates[0] : mergeCrdtUpdates(updates);
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

function actorRangesCover(
  ranges: readonly CrdtSyncActorRange[],
  actor: string,
  start: number,
  end: number
): boolean {
  let cursor = start;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (range.actor !== actor) continue;
    if (range.end < cursor) continue;
    if (range.start > cursor) return false;
    if (range.end >= end) return true;
    cursor = range.end + 1;
  }
  return false;
}
