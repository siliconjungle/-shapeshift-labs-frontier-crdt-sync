import { cloneJson } from '@shapeshift-labs/frontier/clone';
import { createCrdtDocument } from '@shapeshift-labs/frontier-crdt';
import { getCachedPointerPath } from '@shapeshift-labs/frontier/pointer';
import {
  assertPeerId,
  cloneCrdtSyncTransportPayload,
  cloneStateVector,
  decodeCrdtSyncMessage,
  stateVectorsEqual
} from './crdt-sync-wire.js';
import { equalsJson } from '@shapeshift-labs/frontier/equal';
import { createCrdtSyncEndpoint } from './crdt-sync-state.js';
import type {
  CrdtDocument,
  CrdtStateVector,
  CrdtSyncConvergenceResult,
  CrdtSyncConvergenceTarget,
  CrdtSyncEndpoint,
  CrdtSyncMessageReceiver,
  CrdtSyncModelChecker,
  CrdtSyncModelCheckResult,
  CrdtSyncModelDrainOptions,
  CrdtSyncModelEvent,
  CrdtSyncModelSnapshot,
  CrdtSyncQueuedMessage,
  CrdtSyncTransport,
  CrdtSyncTransportPayload,
  JsonPath,
  JsonValue
} from './types.js';

export type CrdtSyncModelScheduleAction =
  | { type: 'connect'; peerId: string }
  | { type: 'disconnect'; peerId: string }
  | { type: 'partition'; left: string | readonly string[]; right: string | readonly string[] }
  | { type: 'heal'; left?: string | readonly string[]; right?: string | readonly string[] }
  | { type: 'duplicate-next'; count?: number }
  | { type: 'drop-next'; count?: number }
  | { type: 'deliver'; messageId: number }
  | { type: 'deliver-next' }
  | { type: 'drain'; maxSteps?: number };

export interface CrdtSyncModelReplayHooks {
  connect?(peerId: string): CrdtSyncMessageReceiver | undefined | Promise<CrdtSyncMessageReceiver | undefined>;
  beforeAction?(action: CrdtSyncModelScheduleAction, index: number, checker: CrdtSyncModelChecker): void | Promise<void>;
  afterAction?(action: CrdtSyncModelScheduleAction, index: number, checker: CrdtSyncModelChecker): void | Promise<void>;
}

export interface CrdtSyncModelReplayResult extends CrdtSyncModelCheckResult {
  actionCount: number;
  snapshot: CrdtSyncModelSnapshot;
}

export type CrdtSyncModelFailurePredicate = (
  schedule: readonly CrdtSyncModelScheduleAction[]
) => boolean | Promise<boolean>;

export interface CrdtSyncModelMinimizeOptions {
  maxPasses?: number;
}

export type CrdtSyncModelReproPath = string | readonly (string | number)[];

export type CrdtSyncModelReproOperation =
  | { type: 'set'; path: CrdtSyncModelReproPath; value: JsonValue }
  | { type: 'delete'; path: CrdtSyncModelReproPath }
  | { type: 'text-insert'; path: CrdtSyncModelReproPath; index: number; text: string }
  | { type: 'text-delete'; path: CrdtSyncModelReproPath; index: number; count?: number }
  | { type: 'list-insert'; path: CrdtSyncModelReproPath; index: number; value: JsonValue }
  | { type: 'list-delete'; path: CrdtSyncModelReproPath; index: number; count?: number }
  | { type: 'counter'; path: CrdtSyncModelReproPath; delta: number };

export interface CrdtSyncModelReproPeer {
  peerId: string;
  actorId?: string;
  history?: readonly CrdtSyncModelReproOperation[];
}

export type CrdtSyncModelReproAction =
  | CrdtSyncModelScheduleAction
  | { type: 'sync'; from: string; to?: string };

export interface CrdtSyncModelReproScenario {
  documentId?: string;
  actorRangeSync?: boolean;
  peers: readonly CrdtSyncModelReproPeer[];
  schedule: readonly CrdtSyncModelReproAction[];
  finalSyncRounds?: number;
  finalDrainMaxSteps?: number;
}

export interface CrdtSyncModelReproReplayResult extends CrdtSyncModelCheckResult {
  actionCount: number;
  peerCount: number;
  operationCount: number;
  snapshot: CrdtSyncModelSnapshot;
  convergence: CrdtSyncConvergenceResult;
  views: Record<string, JsonValue>;
  stateVectors: Record<string, CrdtStateVector>;
  scenario: CrdtSyncModelReproScenario;
}

export type CrdtSyncModelReproPredicate = (
  scenario: CrdtSyncModelReproScenario
) => boolean | Promise<boolean>;

export interface CrdtSyncModelReproMinimizeOptions {
  maxPasses?: number;
  minPeers?: number;
}

export interface CrdtSyncModelReproSummary {
  documentId?: string;
  peerCount: number;
  operationCount: number;
  scheduleLength: number;
  contentBytes: number;
  actorRangeSync: boolean;
}

export interface CrdtSyncModelReproArtifactOptions {
  original?: CrdtSyncModelReproScenario;
  replay?: CrdtSyncModelReproReplayResult;
  generatedAt?: string | Date;
  note?: string;
}

export interface CrdtSyncModelReproArtifact {
  kind: 'frontier-crdt-sync-model-repro';
  version: 1;
  generatedAt: string;
  note?: string;
  summary: {
    original?: CrdtSyncModelReproSummary;
    minimized: CrdtSyncModelReproSummary;
  };
  replay?: {
    valid: boolean;
    convergenceValid: boolean;
    mismatchCount: number;
    delivered: number;
    dropped: number;
    duplicated: number;
    pending: number;
    errors: string[];
    actionCount: number;
    peerCount: number;
    operationCount: number;
  };
  scenario: CrdtSyncModelReproScenario;
}

interface ModelQueuedMessage {
  id: number;
  fromPeerId: string;
  toPeerId: string;
  message: CrdtSyncTransportPayload;
}

interface ReproRuntimePeer {
  peerId: string;
  doc: CrdtDocument;
  endpoint: CrdtSyncEndpoint;
  transport: CrdtSyncTransport | undefined;
  attached: boolean;
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

export async function replayCrdtSyncModelReproScenario(
  scenario: CrdtSyncModelReproScenario
): Promise<CrdtSyncModelReproReplayResult> {
  const normalized = normalizeReproScenario(scenario);
  const checker = createCrdtSyncModelChecker();
  const peers = new Map<string, ReproRuntimePeer>();
  const peerIds = normalized.peers.map((peer) => peer.peerId);
  for (let i = 0; i < normalized.peers.length; i++) {
    const peer = normalized.peers[i];
    const doc = createCrdtDocument({ actorId: peer.actorId || peer.peerId });
    for (let j = 0; j < (peer.history || []).length; j++) applyReproOperation(doc, peer.history[j]);
    const runtimePeer: ReproRuntimePeer = {
      peerId: peer.peerId,
      doc,
      endpoint: createCrdtSyncEndpoint(doc, {
        documentId: normalized.documentId,
        senderId: peer.peerId,
        actorRangeSync: normalized.actorRangeSync
      }),
      transport: undefined,
      attached: false
    };
    peers.set(peer.peerId, runtimePeer);
  }
  for (let i = 0; i < peerIds.length; i++) attachReproPeer(checker, peers, peerIds[i]);
  for (let i = 0; i < normalized.schedule.length; i++) {
    await applyReproAction(checker, peers, normalized.schedule[i]);
  }
  await runFinalReproSync(checker, peers, normalized);
  const check = await checker.drain({ maxSteps: normalized.finalDrainMaxSteps || 0 });
  const convergenceTargets: CrdtSyncConvergenceTarget[] = [];
  const views: Record<string, JsonValue> = {};
  const stateVectors: Record<string, CrdtStateVector> = {};
  for (let i = 0; i < peerIds.length; i++) {
    const peer = peers.get(peerIds[i]) as ReproRuntimePeer;
    const view = cloneJson(peer.doc.toJSON());
    const stateVector = cloneStateVector(peer.doc.getStateVector());
    views[peer.peerId] = view;
    stateVectors[peer.peerId] = stateVector;
    convergenceTargets[convergenceTargets.length] = {
      peerId: peer.peerId,
      view,
      stateVector
    };
  }
  const convergence = checkCrdtSyncConvergence(convergenceTargets);
  return {
    ...check,
    valid: check.valid && convergence.valid,
    errors: convergence.valid ? check.errors : check.errors.concat(['CRDT sync model repro peers did not converge']),
    actionCount: normalized.schedule.length,
    peerCount: normalized.peers.length,
    operationCount: countReproOperations(normalized),
    snapshot: checker.snapshot(),
    convergence,
    views,
    stateVectors,
    scenario: cloneReproScenario(normalized)
  };
}

export async function minimizeCrdtSyncModelReproScenario(
  scenario: CrdtSyncModelReproScenario,
  predicate: CrdtSyncModelReproPredicate,
  options?: CrdtSyncModelReproMinimizeOptions
): Promise<CrdtSyncModelReproScenario> {
  let current = normalizeReproScenario(scenario);
  if (!(await predicate(current))) return cloneReproScenario(current);
  const maxPasses = Math.max(1, Math.floor(options?.maxPasses ?? 12));
  const minPeers = Math.max(1, Math.floor(options?.minPeers ?? 2));
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    const peerShrunk = await shrinkReproPeers(current, predicate, minPeers);
    if (peerShrunk !== current) {
      current = peerShrunk;
      changed = true;
    }
    const historyShrunk = await shrinkReproHistories(current, predicate);
    if (historyShrunk !== current) {
      current = historyShrunk;
      changed = true;
    }
    const scheduleShrunk = await shrinkReproSchedule(current, predicate);
    if (scheduleShrunk !== current) {
      current = scheduleShrunk;
      changed = true;
    }
    const contentShrunk = await shrinkReproContent(current, predicate);
    if (contentShrunk !== current) {
      current = contentShrunk;
      changed = true;
    }
    if (!changed) break;
  }
  return cloneReproScenario(current);
}

export function summarizeCrdtSyncModelReproScenario(
  scenario: CrdtSyncModelReproScenario
): CrdtSyncModelReproSummary {
  const normalized = normalizeReproScenario(scenario);
  const summary: CrdtSyncModelReproSummary = {
    peerCount: normalized.peers.length,
    operationCount: countReproOperations(normalized),
    scheduleLength: normalized.schedule.length,
    contentBytes: measureReproContentBytes(normalized),
    actorRangeSync: normalized.actorRangeSync
  };
  if (normalized.documentId !== undefined) summary.documentId = normalized.documentId;
  return summary;
}

export function createCrdtSyncModelReproArtifact(
  scenario: CrdtSyncModelReproScenario,
  options?: CrdtSyncModelReproArtifactOptions
): CrdtSyncModelReproArtifact {
  const minimized = normalizeReproScenario(scenario);
  const generatedAt = options?.generatedAt instanceof Date
    ? options.generatedAt.toISOString()
    : (options?.generatedAt || new Date().toISOString());
  const summary: CrdtSyncModelReproArtifact['summary'] = {
    minimized: summarizeCrdtSyncModelReproScenario(minimized)
  };
  if (options?.original !== undefined) summary.original = summarizeCrdtSyncModelReproScenario(options.original);
  const artifact: CrdtSyncModelReproArtifact = {
    kind: 'frontier-crdt-sync-model-repro',
    version: 1,
    generatedAt,
    summary,
    scenario: cloneReproScenario(minimized)
  };
  if (options?.note !== undefined) artifact.note = options.note;
  if (options?.replay !== undefined) {
    artifact.replay = {
      valid: options.replay.valid,
      convergenceValid: options.replay.convergence.valid,
      mismatchCount: options.replay.convergence.mismatches.length,
      delivered: options.replay.delivered,
      dropped: options.replay.dropped,
      duplicated: options.replay.duplicated,
      pending: options.replay.pending,
      errors: options.replay.errors.slice(),
      actionCount: options.replay.actionCount,
      peerCount: options.replay.peerCount,
      operationCount: options.replay.operationCount
    };
  }
  return artifact;
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

function normalizeReproScenario(scenario: CrdtSyncModelReproScenario): CrdtSyncModelReproScenario {
  if (!scenario || !Array.isArray(scenario.peers)) throw new TypeError('CRDT sync model repro scenario must include peers');
  if (!Array.isArray(scenario.schedule)) throw new TypeError('CRDT sync model repro scenario must include a schedule');
  const peerIds = new Set<string>();
  const peers: CrdtSyncModelReproPeer[] = new Array(scenario.peers.length);
  for (let i = 0; i < scenario.peers.length; i++) {
    const peer = scenario.peers[i];
    assertPeerId(peer.peerId);
    if (peerIds.has(peer.peerId)) throw new TypeError('duplicate CRDT sync model repro peer id: ' + peer.peerId);
    peerIds.add(peer.peerId);
    const history = peer.history === undefined ? [] : peer.history.map(cloneReproOperation);
    peers[i] = { peerId: peer.peerId, history };
    if (peer.actorId !== undefined) peers[i].actorId = peer.actorId;
  }
  if (peers.length === 0) throw new TypeError('CRDT sync model repro scenario must include at least one peer');
  const schedule = new Array<CrdtSyncModelReproAction>(scenario.schedule.length);
  for (let i = 0; i < scenario.schedule.length; i++) {
    const action = cloneReproAction(scenario.schedule[i]);
    assertReproActionPeers(action, peerIds);
    schedule[i] = action;
  }
  const out: CrdtSyncModelReproScenario = {
    actorRangeSync: scenario.actorRangeSync !== false,
    peers,
    schedule
  };
  if (scenario.documentId !== undefined) out.documentId = String(scenario.documentId);
  if (scenario.finalSyncRounds !== undefined) out.finalSyncRounds = readReproNonNegativeInteger(scenario.finalSyncRounds, 'finalSyncRounds');
  if (scenario.finalDrainMaxSteps !== undefined) out.finalDrainMaxSteps = readReproNonNegativeInteger(scenario.finalDrainMaxSteps, 'finalDrainMaxSteps');
  return out;
}

function cloneReproScenario(scenario: CrdtSyncModelReproScenario): CrdtSyncModelReproScenario {
  return normalizeReproScenario(scenario);
}

function cloneReproOperation(operation: CrdtSyncModelReproOperation): CrdtSyncModelReproOperation {
  const path = cloneReproPath(operation.path);
  if (operation.type === 'set') return { type: 'set', path, value: cloneJson(operation.value) };
  if (operation.type === 'delete') return { type: 'delete', path };
  if (operation.type === 'text-insert') {
    return {
      type: 'text-insert',
      path,
      index: readReproNonNegativeInteger(operation.index, 'text insert index'),
      text: String(operation.text)
    };
  }
  if (operation.type === 'text-delete') {
    const cloned: CrdtSyncModelReproOperation = {
      type: 'text-delete',
      path,
      index: readReproNonNegativeInteger(operation.index, 'text delete index')
    };
    if (operation.count !== undefined) cloned.count = readReproPositiveInteger(operation.count, 'text delete count');
    return cloned;
  }
  if (operation.type === 'list-insert') {
    return {
      type: 'list-insert',
      path,
      index: readReproNonNegativeInteger(operation.index, 'list insert index'),
      value: cloneJson(operation.value)
    };
  }
  if (operation.type === 'list-delete') {
    const cloned: CrdtSyncModelReproOperation = {
      type: 'list-delete',
      path,
      index: readReproNonNegativeInteger(operation.index, 'list delete index')
    };
    if (operation.count !== undefined) cloned.count = readReproPositiveInteger(operation.count, 'list delete count');
    return cloned;
  }
  if (operation.type === 'counter') {
    return {
      type: 'counter',
      path,
      delta: readReproInteger(operation.delta, 'counter delta')
    };
  }
  const exhaustive: never = operation;
  throw new TypeError('unknown CRDT sync model repro operation: ' + String((exhaustive as { type?: unknown }).type));
}

function cloneReproPath(path: CrdtSyncModelReproPath): CrdtSyncModelReproPath {
  return normalizeReproPath(path, 'path');
}

function normalizeReproPath(path: CrdtSyncModelReproPath, label: string): JsonPath {
  if (typeof path === 'string') return getCachedPointerPath(path).slice();
  if (!Array.isArray(path)) throw new TypeError('CRDT sync model repro ' + label + ' must be a JSON Pointer or path array');
  const out: JsonPath = new Array(path.length);
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    if (typeof segment !== 'string' && typeof segment !== 'number') {
      throw new TypeError('CRDT sync model repro path segment must be a string or number');
    }
    out[i] = segment;
  }
  return out;
}

function cloneReproAction(action: CrdtSyncModelReproAction): CrdtSyncModelReproAction {
  if (action.type === 'sync') {
    const cloned: CrdtSyncModelReproAction = { type: 'sync', from: action.from };
    if (action.to !== undefined) cloned.to = action.to;
    return cloned;
  }
  return cloneScheduleAction(action);
}

function assertReproActionPeers(action: CrdtSyncModelReproAction, peerIds: Set<string>): void {
  forEachReproActionPeer(action, (peerId) => {
    assertPeerId(peerId);
    if (!peerIds.has(peerId)) throw new TypeError('CRDT sync model repro action references unknown peer: ' + peerId);
  });
}

function forEachReproActionPeer(action: CrdtSyncModelReproAction, visitor: (peerId: string) => void): void {
  if (action.type === 'connect' || action.type === 'disconnect') {
    visitor(action.peerId);
  } else if (action.type === 'partition') {
    forEachPeerInPeerOrPeers(action.left, visitor);
    forEachPeerInPeerOrPeers(action.right, visitor);
  } else if (action.type === 'heal') {
    if (action.left !== undefined) forEachPeerInPeerOrPeers(action.left, visitor);
    if (action.right !== undefined) forEachPeerInPeerOrPeers(action.right, visitor);
  } else if (action.type === 'sync') {
    visitor(action.from);
    if (action.to !== undefined) visitor(action.to);
  }
}

function forEachPeerInPeerOrPeers(value: string | readonly string[], visitor: (peerId: string) => void): void {
  if (typeof value === 'string') {
    visitor(value);
    return;
  }
  for (let i = 0; i < value.length; i++) visitor(value[i]);
}

function applyReproOperation(doc: CrdtDocument, operation: CrdtSyncModelReproOperation): void {
  const path = normalizeReproPath(operation.path, operation.type + ' path');
  if (operation.type === 'set') {
    doc.set(path, cloneJson(operation.value));
  } else if (operation.type === 'delete') {
    doc.delete(path);
  } else if (operation.type === 'text-insert') {
    if (operation.text.length !== 0) doc.text(path).insert(readReproNonNegativeInteger(operation.index, 'text insert index'), operation.text);
  } else if (operation.type === 'text-delete') {
    doc.text(path).delete(readReproNonNegativeInteger(operation.index, 'text delete index'), readReproPositiveInteger(operation.count ?? 1, 'text delete count'));
  } else if (operation.type === 'list-insert') {
    doc.list(path).insert(readReproNonNegativeInteger(operation.index, 'list insert index'), cloneJson(operation.value));
  } else if (operation.type === 'list-delete') {
    doc.list(path).delete(readReproNonNegativeInteger(operation.index, 'list delete index'), readReproPositiveInteger(operation.count ?? 1, 'list delete count'));
  } else if (operation.type === 'counter') {
    const delta = readReproInteger(operation.delta, 'counter delta');
    if (delta !== 0) doc.counter(path).increment(delta);
  } else {
    const exhaustive: never = operation;
    throw new TypeError('unknown CRDT sync model repro operation: ' + String((exhaustive as { type?: unknown }).type));
  }
}

async function applyReproAction(
  checker: CrdtSyncModelChecker,
  peers: Map<string, ReproRuntimePeer>,
  action: CrdtSyncModelReproAction
): Promise<void> {
  if (action.type === 'sync') {
    sendReproSync(peers, action);
  } else if (action.type === 'connect') {
    attachReproPeer(checker, peers, action.peerId);
  } else if (action.type === 'disconnect') {
    const peer = requireReproPeer(peers, action.peerId);
    checker.disconnect(action.peerId);
    peer.transport = undefined;
    peer.attached = false;
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
    throw new TypeError('unknown CRDT sync model repro action: ' + String((exhaustive as { type?: unknown }).type));
  }
}

function attachReproPeer(
  checker: CrdtSyncModelChecker,
  peers: Map<string, ReproRuntimePeer>,
  peerId: string
): CrdtSyncTransport {
  const peer = requireReproPeer(peers, peerId);
  if (peer.attached && peer.transport !== undefined) return peer.transport;
  peer.transport = checker.connect(peer.peerId, async (message, fromPeerId) => {
    const reply = peer.endpoint.receive(fromPeerId, message);
    if (reply !== undefined && peer.transport !== undefined) peer.transport.send(fromPeerId, reply);
  });
  peer.attached = true;
  return peer.transport;
}

function requireReproPeer(peers: Map<string, ReproRuntimePeer>, peerId: string): ReproRuntimePeer {
  const peer = peers.get(peerId);
  if (peer === undefined) throw new TypeError('unknown CRDT sync model repro peer: ' + peerId);
  return peer;
}

function sendReproSync(peers: Map<string, ReproRuntimePeer>, action: Extract<CrdtSyncModelReproAction, { type: 'sync' }>): void {
  const from = requireReproPeer(peers, action.from);
  if (!from.attached || from.transport === undefined) return;
  const targets = action.to === undefined ? Array.from(peers.keys()).sort() : [action.to];
  for (let i = 0; i < targets.length; i++) {
    const to = requireReproPeer(peers, targets[i]);
    if (to.peerId === from.peerId) continue;
    from.transport.send(to.peerId, from.endpoint.open(to.peerId));
  }
}

async function runFinalReproSync(
  checker: CrdtSyncModelChecker,
  peers: Map<string, ReproRuntimePeer>,
  scenario: CrdtSyncModelReproScenario
): Promise<void> {
  const rounds = Math.max(0, Math.floor(scenario.finalSyncRounds ?? 0));
  if (rounds === 0) return;
  const peerIds = Array.from(peers.keys()).sort();
  const maxSteps = Math.max(1, Math.floor(scenario.finalDrainMaxSteps ?? 2000));
  checker.heal();
  for (let i = 0; i < peerIds.length; i++) attachReproPeer(checker, peers, peerIds[i]);
  for (let round = 0; round < rounds; round++) {
    for (let left = 0; left < peerIds.length; left++) {
      for (let right = 0; right < peerIds.length; right++) {
        if (left === right) continue;
        sendReproSync(peers, { type: 'sync', from: peerIds[left], to: peerIds[right] });
      }
    }
    await checker.drain({ maxSteps });
  }
}

async function shrinkReproPeers(
  scenario: CrdtSyncModelReproScenario,
  predicate: CrdtSyncModelReproPredicate,
  minPeers: number
): Promise<CrdtSyncModelReproScenario> {
  let current = scenario;
  let changed = true;
  while (changed && current.peers.length > minPeers) {
    changed = false;
    for (let size = Math.max(1, Math.floor((current.peers.length - minPeers + 1) / 2)); size >= 1; size = Math.floor(size / 2)) {
      for (let start = 0; start <= current.peers.length - size;) {
        if (current.peers.length - size < minPeers) break;
        const removed = new Set<string>();
        const peers = current.peers.slice(0, start).concat(current.peers.slice(start + size));
        for (let i = start; i < start + size; i++) removed.add(current.peers[i].peerId);
        const candidate = replaceReproPeers(current, peers, dropReproActionsForPeers(current.schedule, removed));
        if (await predicate(candidate)) {
          current = candidate;
          changed = true;
        } else {
          start++;
        }
      }
      if (changed) break;
    }
  }
  return current;
}

async function shrinkReproHistories(
  scenario: CrdtSyncModelReproScenario,
  predicate: CrdtSyncModelReproPredicate
): Promise<CrdtSyncModelReproScenario> {
  let current = scenario;
  for (let peerIndex = 0; peerIndex < current.peers.length; peerIndex++) {
    let history = current.peers[peerIndex].history || [];
    for (let size = Math.max(1, Math.floor(history.length / 2)); size >= 1; size = Math.floor(size / 2)) {
      for (let start = 0; start <= history.length - size;) {
        const nextHistory = history.slice(0, start).concat(history.slice(start + size));
        const candidate = replaceReproPeerHistory(current, peerIndex, nextHistory);
        if (await predicate(candidate)) {
          current = candidate;
          history = current.peers[peerIndex].history || [];
        } else {
          start++;
        }
      }
    }
  }
  return current;
}

async function shrinkReproSchedule(
  scenario: CrdtSyncModelReproScenario,
  predicate: CrdtSyncModelReproPredicate
): Promise<CrdtSyncModelReproScenario> {
  let current = scenario;
  let schedule = current.schedule;
  for (let size = Math.max(1, Math.floor(schedule.length / 2)); size >= 1; size = Math.floor(size / 2)) {
    for (let start = 0; start <= schedule.length - size;) {
      const nextSchedule = schedule.slice(0, start).concat(schedule.slice(start + size));
      const candidate = replaceReproSchedule(current, nextSchedule);
      if (await predicate(candidate)) {
        current = candidate;
        schedule = current.schedule;
      } else {
        start++;
      }
    }
  }
  for (let i = 0; i < current.schedule.length; i++) {
    const variants = makeScheduleActionShrinkVariants(current.schedule[i]);
    for (let j = 0; j < variants.length; j++) {
      const candidate = replaceReproScheduleAction(current, i, variants[j]);
      if (await predicate(candidate)) {
        current = candidate;
        break;
      }
    }
  }
  return current;
}

async function shrinkReproContent(
  scenario: CrdtSyncModelReproScenario,
  predicate: CrdtSyncModelReproPredicate
): Promise<CrdtSyncModelReproScenario> {
  let current = scenario;
  for (let peerIndex = 0; peerIndex < current.peers.length; peerIndex++) {
    const history = current.peers[peerIndex].history || [];
    for (let operationIndex = 0; operationIndex < history.length; operationIndex++) {
      let changed = true;
      while (changed) {
        changed = false;
        const operation = (current.peers[peerIndex].history || [])[operationIndex];
        if (operation === undefined) break;
        const variants = makeOperationContentShrinkVariants(operation);
        for (let i = 0; i < variants.length; i++) {
          const candidate = replaceReproOperation(current, peerIndex, operationIndex, variants[i]);
          if (await predicate(candidate)) {
            current = candidate;
            changed = true;
            break;
          }
        }
      }
    }
  }
  return current;
}

function replaceReproPeers(
  scenario: CrdtSyncModelReproScenario,
  peers: readonly CrdtSyncModelReproPeer[],
  schedule: readonly CrdtSyncModelReproAction[]
): CrdtSyncModelReproScenario {
  return normalizeReproScenario({ ...scenario, peers, schedule });
}

function replaceReproPeerHistory(
  scenario: CrdtSyncModelReproScenario,
  peerIndex: number,
  history: readonly CrdtSyncModelReproOperation[]
): CrdtSyncModelReproScenario {
  const peers = scenario.peers.map((peer, index) => index === peerIndex
    ? { ...peer, history: history.map(cloneReproOperation) }
    : { ...peer, history: (peer.history || []).map(cloneReproOperation) });
  return normalizeReproScenario({ ...scenario, peers });
}

function replaceReproSchedule(
  scenario: CrdtSyncModelReproScenario,
  schedule: readonly CrdtSyncModelReproAction[]
): CrdtSyncModelReproScenario {
  return normalizeReproScenario({ ...scenario, schedule });
}

function replaceReproScheduleAction(
  scenario: CrdtSyncModelReproScenario,
  actionIndex: number,
  action: CrdtSyncModelReproAction
): CrdtSyncModelReproScenario {
  const schedule = scenario.schedule.map((existing, index) => index === actionIndex ? cloneReproAction(action) : cloneReproAction(existing));
  return normalizeReproScenario({ ...scenario, schedule });
}

function replaceReproOperation(
  scenario: CrdtSyncModelReproScenario,
  peerIndex: number,
  operationIndex: number,
  operation: CrdtSyncModelReproOperation
): CrdtSyncModelReproScenario {
  const peers = scenario.peers.map((peer, index) => {
    const history = (peer.history || []).map((existing, opIndex) => (
      index === peerIndex && opIndex === operationIndex ? cloneReproOperation(operation) : cloneReproOperation(existing)
    ));
    return { ...peer, history };
  });
  return normalizeReproScenario({ ...scenario, peers });
}

function dropReproActionsForPeers(
  schedule: readonly CrdtSyncModelReproAction[],
  removed: Set<string>
): CrdtSyncModelReproAction[] {
  const out: CrdtSyncModelReproAction[] = [];
  for (let i = 0; i < schedule.length; i++) {
    const action = schedule[i];
    if (!reproActionTouchesAnyPeer(action, removed)) out[out.length] = cloneReproAction(action);
  }
  return out;
}

function reproActionTouchesAnyPeer(action: CrdtSyncModelReproAction, removed: Set<string>): boolean {
  let touches = false;
  forEachReproActionPeer(action, (peerId) => {
    if (removed.has(peerId)) touches = true;
  });
  return touches;
}

function makeScheduleActionShrinkVariants(action: CrdtSyncModelReproAction): CrdtSyncModelReproAction[] {
  const variants: CrdtSyncModelReproAction[] = [];
  if (action.type === 'duplicate-next' && (action.count ?? 1) > 1) variants[variants.length] = { type: 'duplicate-next', count: 1 };
  if (action.type === 'drop-next' && (action.count ?? 1) > 1) variants[variants.length] = { type: 'drop-next', count: 1 };
  if (action.type === 'drain' && (action.maxSteps ?? 0) > 1) variants[variants.length] = { type: 'drain', maxSteps: 1 };
  if (action.type === 'deliver' && action.messageId > 1) variants[variants.length] = { type: 'deliver', messageId: 1 };
  if (action.type === 'heal' && (action.left !== undefined || action.right !== undefined)) variants[variants.length] = { type: 'heal' };
  if (action.type === 'partition') {
    const left = firstPeerFromPeerOrPeers(action.left);
    const right = firstPeerFromPeerOrPeers(action.right);
    if (left !== undefined && right !== undefined && (left !== action.left || right !== action.right)) {
      variants[variants.length] = { type: 'partition', left, right };
    }
  }
  return variants;
}

function firstPeerFromPeerOrPeers(value: string | readonly string[]): string | undefined {
  return typeof value === 'string' ? value : value[0];
}

function makeOperationContentShrinkVariants(operation: CrdtSyncModelReproOperation): CrdtSyncModelReproOperation[] {
  const variants: CrdtSyncModelReproOperation[] = [];
  if (operation.type === 'set') {
    const values = makeJsonValueShrinkVariants(operation.value);
    for (let i = 0; i < values.length; i++) variants[variants.length] = { ...operation, value: values[i] };
  } else if (operation.type === 'text-insert') {
    if (operation.text.length > 1) variants[variants.length] = { ...operation, text: operation.text.slice(0, Math.max(1, Math.floor(operation.text.length / 2))) };
    if (operation.index > 0) variants[variants.length] = { ...operation, index: 0 };
  } else if (operation.type === 'text-delete') {
    if ((operation.count ?? 1) > 1) variants[variants.length] = { ...operation, count: 1 };
    if (operation.index > 0) variants[variants.length] = { ...operation, index: 0 };
  } else if (operation.type === 'list-insert') {
    const values = makeJsonValueShrinkVariants(operation.value);
    for (let i = 0; i < values.length; i++) variants[variants.length] = { ...operation, value: values[i] };
    if (operation.index > 0) variants[variants.length] = { ...operation, index: 0 };
  } else if (operation.type === 'list-delete') {
    if ((operation.count ?? 1) > 1) variants[variants.length] = { ...operation, count: 1 };
    if (operation.index > 0) variants[variants.length] = { ...operation, index: 0 };
  } else if (operation.type === 'counter') {
    if (operation.delta > 1) variants[variants.length] = { ...operation, delta: 1 };
    if (operation.delta < -1) variants[variants.length] = { ...operation, delta: -1 };
  }
  return uniqueReproOperations(variants);
}

function makeJsonValueShrinkVariants(value: JsonValue): JsonValue[] {
  const variants: JsonValue[] = [];
  if (typeof value === 'string') {
    if (value.length > 1) {
      pushUniqueJsonVariant(variants, value.slice(0, Math.max(1, Math.floor(value.length / 2))));
      pushUniqueJsonVariant(variants, value.slice(0, 1));
    }
    if (value.length !== 0) pushUniqueJsonVariant(variants, '');
  } else if (typeof value === 'number') {
    if (value !== 0) pushUniqueJsonVariant(variants, 0);
  } else if (typeof value === 'boolean') {
    if (value) pushUniqueJsonVariant(variants, false);
  } else if (Array.isArray(value)) {
    if (value.length > 1) pushUniqueJsonVariant(variants, value.slice(0, Math.max(1, Math.floor(value.length / 2))).map((item) => cloneJson(item)));
    if (value.length !== 0) pushUniqueJsonVariant(variants, []);
  } else if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    if (keys.length > 1) {
      const kept = keys.slice(0, Math.max(1, Math.floor(keys.length / 2)));
      const partial: Record<string, JsonValue> = {};
      for (let i = 0; i < kept.length; i++) partial[kept[i]] = cloneJson((value as Record<string, JsonValue>)[kept[i]]);
      pushUniqueJsonVariant(variants, partial);
    }
    if (keys.length !== 0) pushUniqueJsonVariant(variants, {});
  }
  return variants;
}

function pushUniqueJsonVariant(variants: JsonValue[], value: JsonValue): void {
  const key = JSON.stringify(value);
  for (let i = 0; i < variants.length; i++) {
    if (JSON.stringify(variants[i]) === key) return;
  }
  variants[variants.length] = cloneJson(value);
}

function uniqueReproOperations(operations: CrdtSyncModelReproOperation[]): CrdtSyncModelReproOperation[] {
  const out: CrdtSyncModelReproOperation[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < operations.length; i++) {
    const key = JSON.stringify(operations[i]);
    if (seen.has(key)) continue;
    seen.add(key);
    out[out.length] = cloneReproOperation(operations[i]);
  }
  return out;
}

function countReproOperations(scenario: CrdtSyncModelReproScenario): number {
  let count = 0;
  for (let i = 0; i < scenario.peers.length; i++) count += (scenario.peers[i].history || []).length;
  return count;
}

function measureReproContentBytes(scenario: CrdtSyncModelReproScenario): number {
  let bytes = 0;
  for (let i = 0; i < scenario.peers.length; i++) {
    const history = scenario.peers[i].history || [];
    for (let j = 0; j < history.length; j++) bytes += JSON.stringify(history[j]).length;
  }
  return bytes;
}

function readReproNonNegativeInteger(value: number, label: string): number {
  const number = readReproInteger(value, label);
  if (number < 0) throw new RangeError('CRDT sync model repro ' + label + ' must be non-negative');
  return number;
}

function readReproPositiveInteger(value: number, label: string): number {
  const number = readReproInteger(value, label);
  if (number < 1) throw new RangeError('CRDT sync model repro ' + label + ' must be positive');
  return number;
}

function readReproInteger(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError('CRDT sync model repro ' + label + ' must be finite');
  const number = Math.trunc(value);
  if (!Number.isSafeInteger(number)) throw new RangeError('CRDT sync model repro ' + label + ' must be a safe integer');
  return number;
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
