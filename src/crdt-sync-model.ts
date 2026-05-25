import { cloneJson } from '@shapeshift-labs/frontier/clone';
import {
  assertPeerId,
  cloneCrdtSyncTransportPayload,
  cloneStateVector,
  decodeCrdtSyncMessage,
  stateVectorsEqual
} from './crdt-sync-wire.js';
import { equalsJson } from '@shapeshift-labs/frontier/equal';
import type {
  CrdtDocument,
  CrdtStateVector,
  CrdtSyncConvergenceResult,
  CrdtSyncConvergenceTarget,
  CrdtSyncMessageReceiver,
  CrdtSyncModelFailurePredicate,
  CrdtSyncModelChecker,
  CrdtSyncModelCheckResult,
  CrdtSyncModelDrainOptions,
  CrdtSyncModelEvent,
  CrdtSyncModelMinimizeOptions,
  CrdtSyncModelReplayHooks,
  CrdtSyncModelReplayResult,
  CrdtSyncModelScheduleAction,
  CrdtSyncModelSnapshot,
  CrdtSyncQueuedMessage,
  CrdtSyncTransport,
  CrdtSyncTransportPayload,
  JsonValue
} from './types.js';

interface ModelQueuedMessage {
  id: number;
  fromPeerId: string;
  toPeerId: string;
  message: CrdtSyncTransportPayload;
}

export function createCrdtSyncModelChecker(): CrdtSyncModelChecker {
  return new FrontierCrdtSyncModelChecker();
}

export async function replayCrdtSyncModelSchedule(
  checker: CrdtSyncModelChecker,
  schedule: readonly CrdtSyncModelScheduleAction[],
  hooks?: CrdtSyncModelReplayHooks
): Promise<CrdtSyncModelReplayResult> {
  for (let i = 0; i < schedule.length; i++) {
    const action = schedule[i];
    if (hooks?.beforeAction !== undefined) await hooks.beforeAction(action, i, checker);
    await applyScheduleAction(checker, action, hooks);
    if (hooks?.afterAction !== undefined) await hooks.afterAction(action, i, checker);
  }
  const result = await checker.drain({ maxSteps: 0 });
  return {
    ...result,
    actionCount: schedule.length,
    snapshot: checker.snapshot()
  };
}

export async function minimizeCrdtSyncModelSchedule(
  schedule: readonly CrdtSyncModelScheduleAction[],
  predicate: CrdtSyncModelFailurePredicate,
  options?: CrdtSyncModelMinimizeOptions
): Promise<CrdtSyncModelScheduleAction[]> {
  let current = schedule.map(cloneScheduleAction);
  if (current.length === 0 || !(await predicate(current))) return current;
  const maxPasses = Math.max(1, Math.floor(options?.maxPasses ?? 16));
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (let size = Math.max(1, Math.floor(current.length / 2)); size >= 1; size = Math.floor(size / 2)) {
      for (let start = 0; start <= current.length - size;) {
        const candidate = current.slice(0, start).concat(current.slice(start + size));
        if (candidate.length !== current.length && await predicate(candidate)) {
          current = candidate;
          changed = true;
        } else {
          start++;
        }
      }
    }
    if (!changed) break;
  }
  return current.map(cloneScheduleAction);
}

export function checkCrdtSyncConvergence(
  peers: Record<string, CrdtSyncConvergenceTarget> | readonly CrdtSyncConvergenceTarget[]
): CrdtSyncConvergenceResult {
  const normalized = normalizeConvergencePeers(peers);
  const mismatches: CrdtSyncConvergenceResult['mismatches'] = [];
  if (normalized.length > 1) {
    const expected = normalized[0];
    for (let i = 1; i < normalized.length; i++) {
      const actual = normalized[i];
      if (!equalsJson(actual.view, expected.view)) {
        mismatches[mismatches.length] = {
          peerId: actual.peerId,
          expectedPeerId: expected.peerId,
          kind: 'view',
          expected: cloneJson(expected.view),
          actual: cloneJson(actual.view)
        };
      }
      if (expected.stateVector !== undefined || actual.stateVector !== undefined) {
        if (!stateVectorsEqual(actual.stateVector || {}, expected.stateVector || {})) {
          mismatches[mismatches.length] = {
            peerId: actual.peerId,
            expectedPeerId: expected.peerId,
            kind: 'state-vector',
            expected: cloneStateVector(expected.stateVector || {}),
            actual: cloneStateVector(actual.stateVector || {})
          };
        }
      }
    }
  }
  return {
    valid: mismatches.length === 0,
    peers: normalized,
    mismatches
  };
}

class FrontierCrdtSyncModelChecker implements CrdtSyncModelChecker {
  private readonly receivers = new Map<string, CrdtSyncMessageReceiver>();
  private readonly queued: ModelQueuedMessage[] = [];
  private readonly partitions = new Set<string>();
  private readonly events: CrdtSyncModelEvent[] = [];
  private nextMessageId = 1;
  private step = 0;
  private delivered = 0;
  private dropped = 0;
  private duplicated = 0;
  private readonly errors: string[] = [];

  connect(peerId: string, receiver?: CrdtSyncMessageReceiver): CrdtSyncTransport {
    assertPeerId(peerId);
    if (receiver !== undefined) this.receivers.set(peerId, receiver);
    this.record({ type: 'connect', fromPeerId: peerId });
    return new FrontierCrdtSyncModelTransport(peerId, this);
  }

  disconnect(peerId: string): boolean {
    assertPeerId(peerId);
    const deleted = this.receivers.delete(peerId);
    this.record({ type: 'disconnect', fromPeerId: peerId });
    return deleted;
  }

  getPeerIds(): string[] {
    return Array.from(this.receivers.keys()).sort();
  }

  partition(left: string | readonly string[], right: string | readonly string[]): void {
    const leftPeers = normalizePeerList(left);
    const rightPeers = normalizePeerList(right);
    for (let i = 0; i < leftPeers.length; i++) {
      for (let j = 0; j < rightPeers.length; j++) {
        if (leftPeers[i] === rightPeers[j]) continue;
        this.partitions.add(partitionKey(leftPeers[i], rightPeers[j]));
        this.partitions.add(partitionKey(rightPeers[j], leftPeers[i]));
      }
    }
    this.record({ type: 'partition', queueLength: this.queued.length });
  }

  heal(left?: string | readonly string[], right?: string | readonly string[]): void {
    if (left === undefined || right === undefined) {
      this.partitions.clear();
      this.record({ type: 'heal', queueLength: this.queued.length });
      return;
    }
    const leftPeers = normalizePeerList(left);
    const rightPeers = normalizePeerList(right);
    for (let i = 0; i < leftPeers.length; i++) {
      for (let j = 0; j < rightPeers.length; j++) {
        this.partitions.delete(partitionKey(leftPeers[i], rightPeers[j]));
        this.partitions.delete(partitionKey(rightPeers[j], leftPeers[i]));
      }
    }
    this.record({ type: 'heal', queueLength: this.queued.length });
  }

  isPartitioned(fromPeerId: string, toPeerId: string): boolean {
    assertPeerId(fromPeerId);
    assertPeerId(toPeerId);
    return this.partitions.has(partitionKey(fromPeerId, toPeerId));
  }

  enqueue(fromPeerId: string, toPeerId: string, message: CrdtSyncTransportPayload): void {
    assertPeerId(fromPeerId);
    assertPeerId(toPeerId);
    const decoded = decodeCrdtSyncMessage(message);
    if (this.isPartitioned(fromPeerId, toPeerId) || !this.receivers.has(toPeerId)) {
      this.dropped++;
      this.record({
        type: 'drop',
        fromPeerId,
        toPeerId,
        messageType: decoded.type,
        documentId: decoded.documentId,
        queueLength: this.queued.length
      });
      return;
    }
    const queued: ModelQueuedMessage = {
      id: this.nextMessageId++,
      fromPeerId,
      toPeerId,
      message: cloneCrdtSyncTransportPayload(message)
    };
    this.queued[this.queued.length] = queued;
    this.record({
      type: 'send',
      fromPeerId,
      toPeerId,
      messageId: queued.id,
      messageType: decoded.type,
      documentId: decoded.documentId,
      queueLength: this.queued.length
    });
  }

  subscribe(peerId: string, receiver: CrdtSyncMessageReceiver): () => void {
    assertPeerId(peerId);
    this.receivers.set(peerId, receiver);
    return () => {
      const current = this.receivers.get(peerId);
      if (current === receiver) this.receivers.delete(peerId);
    };
  }

  duplicateNext(count = 1): number {
    const copies = Math.max(0, Math.floor(count));
    if (copies === 0 || this.queued.length === 0) return 0;
    const original = this.queued[0];
    for (let i = 0; i < copies; i++) {
      const duplicated: ModelQueuedMessage = {
        id: this.nextMessageId++,
        fromPeerId: original.fromPeerId,
        toPeerId: original.toPeerId,
        message: cloneCrdtSyncTransportPayload(original.message)
      };
      this.queued.splice(1 + i, 0, duplicated);
      this.duplicated++;
      const decoded = decodeCrdtSyncMessage(duplicated.message);
      this.record({
        type: 'duplicate',
        fromPeerId: duplicated.fromPeerId,
        toPeerId: duplicated.toPeerId,
        messageId: duplicated.id,
        messageType: decoded.type,
        documentId: decoded.documentId,
        queueLength: this.queued.length
      });
    }
    return copies;
  }

  dropNext(count = 1): number {
    const drops = Math.min(this.queued.length, Math.max(0, Math.floor(count)));
    for (let i = 0; i < drops; i++) {
      const dropped = this.queued.shift() as ModelQueuedMessage;
      const decoded = decodeCrdtSyncMessage(dropped.message);
      this.dropped++;
      this.record({
        type: 'drop',
        fromPeerId: dropped.fromPeerId,
        toPeerId: dropped.toPeerId,
        messageId: dropped.id,
        messageType: decoded.type,
        documentId: decoded.documentId,
        queueLength: this.queued.length
      });
    }
    return drops;
  }

  async deliver(messageId: number): Promise<CrdtSyncQueuedMessage | undefined> {
    if (!Number.isSafeInteger(messageId) || messageId < 1) throw new RangeError('CRDT sync model message id must be a positive safe integer');
    const index = this.queued.findIndex((message) => message.id === messageId);
    if (index < 0) return undefined;
    return this.deliverAt(index);
  }

  async deliverNext(): Promise<CrdtSyncQueuedMessage | undefined> {
    return this.deliverAt(0);
  }

  private async deliverAt(index: number): Promise<CrdtSyncQueuedMessage | undefined> {
    const queued = this.queued.splice(index, 1)[0];
    if (queued === undefined) return undefined;
    const decoded = decodeCrdtSyncMessage(queued.message);
    const receiver = this.receivers.get(queued.toPeerId);
    if (receiver === undefined || this.isPartitioned(queued.fromPeerId, queued.toPeerId)) {
      this.dropped++;
      this.record({
        type: 'drop',
        fromPeerId: queued.fromPeerId,
        toPeerId: queued.toPeerId,
        messageId: queued.id,
        messageType: decoded.type,
        documentId: decoded.documentId,
        queueLength: this.queued.length
      });
      return toPublicQueuedMessage(queued);
    }
    try {
      await receiver(cloneCrdtSyncTransportPayload(queued.message), queued.fromPeerId);
      this.delivered++;
      this.record({
        type: 'deliver',
        fromPeerId: queued.fromPeerId,
        toPeerId: queued.toPeerId,
        messageId: queued.id,
        messageType: decoded.type,
        documentId: decoded.documentId,
        queueLength: this.queued.length
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.errors[this.errors.length] = message;
      this.record({
        type: 'error',
        fromPeerId: queued.fromPeerId,
        toPeerId: queued.toPeerId,
        messageId: queued.id,
        messageType: decoded.type,
        documentId: decoded.documentId,
        queueLength: this.queued.length,
        error: message
      });
    }
    return toPublicQueuedMessage(queued);
  }

  async drain(options?: CrdtSyncModelDrainOptions): Promise<CrdtSyncModelCheckResult> {
    const maxSteps = Math.max(0, Math.floor(options?.maxSteps ?? 1000));
    let steps = 0;
    while (this.queued.length !== 0 && steps < maxSteps) {
      await this.deliverNext();
      steps++;
    }
    return {
      valid: this.errors.length === 0 && this.queued.length === 0,
      delivered: this.delivered,
      dropped: this.dropped,
      duplicated: this.duplicated,
      pending: this.queued.length,
      errors: this.errors.slice(),
      history: this.history()
    };
  }

  queueSnapshot(): CrdtSyncQueuedMessage[] {
    return this.queued.map(toPublicQueuedMessage);
  }

  snapshot(): CrdtSyncModelSnapshot {
    return {
      peerIds: this.getPeerIds(),
      partitions: partitionSnapshot(this.partitions),
      queued: this.queueSnapshot(),
      delivered: this.delivered,
      dropped: this.dropped,
      duplicated: this.duplicated,
      pending: this.queued.length,
      errors: this.errors.slice(),
      history: this.history()
    };
  }

  history(): CrdtSyncModelEvent[] {
    return this.events.map((event) => ({ ...event }));
  }

  clearHistory(): void {
    this.events.length = 0;
    this.errors.length = 0;
    this.delivered = 0;
    this.dropped = 0;
    this.duplicated = 0;
    this.step = 0;
  }

  private record(event: Omit<CrdtSyncModelEvent, 'step'>): void {
    this.events[this.events.length] = {
      step: ++this.step,
      ...event
    };
  }
}

async function applyScheduleAction(
  checker: CrdtSyncModelChecker,
  action: CrdtSyncModelScheduleAction,
  hooks?: CrdtSyncModelReplayHooks
): Promise<void> {
  if (action.type === 'connect') {
    const receiver = hooks?.connect === undefined ? undefined : await hooks.connect(action.peerId);
    checker.connect(action.peerId, receiver);
  } else if (action.type === 'disconnect') {
    checker.disconnect(action.peerId);
  } else if (action.type === 'partition') {
    checker.partition(action.left, action.right);
  } else if (action.type === 'heal') {
    checker.heal(action.left, action.right);
  } else if (action.type === 'duplicate-next') {
    checker.duplicateNext(action.count);
  } else if (action.type === 'drop-next') {
    checker.dropNext(action.count);
  } else if (action.type === 'deliver') {
    await checker.deliver(action.messageId);
  } else if (action.type === 'deliver-next') {
    await checker.deliverNext();
  } else if (action.type === 'drain') {
    await checker.drain({ maxSteps: action.maxSteps });
  } else {
    const exhaustive: never = action;
    throw new TypeError('unknown CRDT sync model action: ' + String((exhaustive as { type?: unknown }).type));
  }
}

function cloneScheduleAction(action: CrdtSyncModelScheduleAction): CrdtSyncModelScheduleAction {
  if (action.type === 'partition') {
    return {
      type: 'partition',
      left: clonePeerOrPeers(action.left),
      right: clonePeerOrPeers(action.right)
    };
  }
  if (action.type === 'heal') {
    const cloned: CrdtSyncModelScheduleAction = { type: 'heal' };
    if (action.left !== undefined) cloned.left = clonePeerOrPeers(action.left);
    if (action.right !== undefined) cloned.right = clonePeerOrPeers(action.right);
    return cloned;
  }
  return { ...action };
}

function clonePeerOrPeers(value: string | readonly string[]): string | string[] {
  return typeof value === 'string' ? value : value.slice();
}

class FrontierCrdtSyncModelTransport implements CrdtSyncTransport {
  constructor(
    private readonly senderId: string,
    private readonly checker: FrontierCrdtSyncModelChecker
  ) {}

  connect(): void {}

  disconnect(): void {
    this.checker.disconnect(this.senderId);
  }

  send(peerId: string, message: CrdtSyncTransportPayload): void {
    this.checker.enqueue(this.senderId, peerId, message);
  }

  subscribe(receiver: CrdtSyncMessageReceiver): () => void {
    return this.checker.subscribe(this.senderId, receiver);
  }
}

function toPublicQueuedMessage(message: ModelQueuedMessage): CrdtSyncQueuedMessage {
  return {
    id: message.id,
    fromPeerId: message.fromPeerId,
    toPeerId: message.toPeerId,
    message: decodeCrdtSyncMessage(message.message)
  };
}

function normalizePeerList(peerOrPeers: string | readonly string[]): string[] {
  const peers = typeof peerOrPeers === 'string' ? [peerOrPeers] : peerOrPeers.slice();
  for (let i = 0; i < peers.length; i++) assertPeerId(peers[i]);
  return peers;
}

function partitionKey(fromPeerId: string, toPeerId: string): string {
  return `${fromPeerId}\0${toPeerId}`;
}

function partitionSnapshot(partitions: Set<string>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const key of partitions) {
    const split = key.indexOf('\0');
    if (split < 0) continue;
    const left = key.slice(0, split);
    const right = key.slice(split + 1);
    const canonical = left < right ? partitionKey(left, right) : partitionKey(right, left);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out[out.length] = left < right ? [left, right] : [right, left];
  }
  out.sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
  return out;
}

function normalizeConvergencePeers(
  peers: Record<string, CrdtSyncConvergenceTarget> | readonly CrdtSyncConvergenceTarget[]
): CrdtSyncConvergenceResult['peers'] {
  if (Array.isArray(peers)) {
    return peers.map((peer, index) => readConvergencePeer(peer, 'peer-' + index));
  }
  const peerIds = Object.keys(peers).sort();
  const out: CrdtSyncConvergenceResult['peers'] = new Array(peerIds.length);
  for (let i = 0; i < peerIds.length; i++) {
    const peerId = peerIds[i];
    out[i] = readConvergencePeer(peers[peerId], peerId);
  }
  return out;
}

function readConvergencePeer(target: CrdtSyncConvergenceTarget, fallbackPeerId: string): CrdtSyncConvergenceResult['peers'][number] {
  const maybePeer = target as {
    peerId?: string;
    view?: JsonValue;
    stateVector?: CrdtStateVector;
    doc?: CrdtDocument;
    toJSON?: () => JsonValue;
    getStateVector?: () => CrdtStateVector;
  };
  const peerId = typeof maybePeer.peerId === 'string' && maybePeer.peerId.length > 0 ? maybePeer.peerId : fallbackPeerId;
  if (maybePeer.view !== undefined) {
    const peer: CrdtSyncConvergenceResult['peers'][number] = {
      peerId,
      view: cloneJson(maybePeer.view)
    };
    if (maybePeer.stateVector !== undefined) peer.stateVector = cloneStateVector(maybePeer.stateVector);
    return peer;
  }
  const source = maybePeer.doc !== undefined ? maybePeer.doc : maybePeer;
  if (typeof source.toJSON !== 'function') throw new TypeError('CRDT convergence peer must expose toJSON(), doc, or view');
  const peer: CrdtSyncConvergenceResult['peers'][number] = {
    peerId,
    view: cloneJson(source.toJSON())
  };
  if (typeof source.getStateVector === 'function') peer.stateVector = cloneStateVector(source.getStateVector());
  return peer;
}
