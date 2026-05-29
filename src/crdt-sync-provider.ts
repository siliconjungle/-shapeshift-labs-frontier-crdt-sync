import {
  assertPeerId,
  cloneCrdtSyncMessage,
  decodeCrdtSyncMessage,
  encodeCrdtSyncMessage
} from './crdt-sync-wire.js';
import type {
  CrdtLocalSyncNetwork,
  CrdtStateVector,
  CrdtSyncLazyBodyStoreLike,
  CrdtSyncEndpoint,
  CrdtSyncMessage,
  CrdtSyncMessageInput,
  CrdtSyncMessageReceiver,
  CrdtSyncProvider,
  CrdtSyncProviderEvent,
  CrdtSyncProviderEventListener,
  CrdtSyncProviderOptions,
  CrdtSyncProviderLazyBodyOptions,
  CrdtSyncProviderStatus,
  CrdtSyncTransport,
  CrdtSyncTransportPayload
} from './types.js';

type CrdtSyncLazyBodyModule = typeof import('./crdt-sync-lazy-body.js');

let lazyBodyModulePromise: Promise<CrdtSyncLazyBodyModule> | undefined;

export function createCrdtSyncProvider(endpoint: CrdtSyncEndpoint, options?: CrdtSyncProviderOptions): CrdtSyncProvider {
  return new FrontierCrdtSyncProvider(endpoint, options);
}

export function createCrdtLocalSyncNetwork(): CrdtLocalSyncNetwork {
  return new FrontierCrdtLocalSyncNetwork();
}

export interface CrdtSyncSchedulerTask extends Record<string, unknown> {
  run(context?: unknown): unknown;
}

export interface CrdtSyncSchedulerLike {
  schedule(task: CrdtSyncSchedulerTask): unknown;
  run?(options?: unknown): unknown;
  requestRun?(options?: unknown): unknown;
}

export interface CrdtSyncScheduleOptions {
  scheduler: CrdtSyncSchedulerLike;
  id?: string;
  peerId?: string;
  lane?: string;
  priority?: unknown;
  units?: number;
  key?: string;
  causeId?: string;
  parentId?: string;
  dependsOn?: readonly string[];
  autoRun?: boolean;
  runOptions?: unknown;
  metadata?: Record<string, unknown>;
  onError?: (error: unknown) => void;
}

export function scheduleCrdtSync(provider: CrdtSyncProvider, options: CrdtSyncScheduleOptions): unknown {
  const scheduler = options.scheduler;
  if (typeof (provider as { sync?: unknown } | null | undefined)?.sync !== 'function' || typeof (scheduler as { schedule?: unknown } | null | undefined)?.schedule !== 'function') {
    throw new TypeError('invalid crdt sync scheduler');
  }
  const peerId = options.peerId;
  const scheduled = scheduler.schedule({
    id: options.id,
    type: 'frontier.crdt-sync.sync',
    lane: options.lane ?? 'sync',
    priority: options.priority ?? 'normal',
    units: options.units ?? 1,
    key: options.key ?? 'sync:' + (provider.endpoint.documentId ?? 'doc') + ':' + (peerId ?? '*'),
    causeId: options.causeId,
    parentId: options.parentId,
    dependsOn: options.dependsOn,
    metadata: {
      documentId: provider.endpoint.documentId,
      peerId,
      ...(options.metadata ?? {})
    },
    run() {
      try {
        const result = provider.sync(peerId);
        if (options.onError) void Promise.resolve(result).catch(options.onError);
        return result;
      } catch (error) {
        options.onError?.(error);
        if (!options.onError) throw error;
      }
    }
  });
  if (options.autoRun === true) {
    (scheduler.requestRun ?? scheduler.run)?.call(scheduler, options.runOptions);
  }
  return scheduled;
}

class FrontierCrdtSyncProvider implements CrdtSyncProvider {
  private readonly peers = new Set<string>();
  private readonly transport?: CrdtSyncProviderOptions['transport'];
  private readonly encodeMessages: boolean;
  private readonly syncOnConnect: boolean;
  private readonly lazyBodies?: Required<CrdtSyncProviderLazyBodyOptions>;
  private readonly listeners = new Set<CrdtSyncProviderEventListener>();
  private unsubscribeTransport: (() => void) | undefined;
  private currentStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  constructor(readonly endpoint: CrdtSyncEndpoint, options?: CrdtSyncProviderOptions) {
    this.transport = options?.transport;
    this.encodeMessages = options?.encodeMessages !== false;
    this.syncOnConnect = options?.syncOnConnect === true;
    this.lazyBodies = normalizeLazyBodies(options?.lazyBodies);
    if (options?.peers) {
      for (let i = 0; i < options.peers.length; i++) this.addPeer(options.peers[i]);
    }
  }

  get status(): 'disconnected' | 'connecting' | 'connected' {
    return this.currentStatus;
  }

  getPeerIds(): string[] {
    return Array.from(this.peers).sort();
  }

  getPeerInfo(peerId: string): { peerId: string; stateVector: CrdtStateVector; hasChanges: boolean } {
    const state = this.endpoint.getPeerState(peerId);
    return {
      peerId,
      stateVector: state.getStateVector(),
      hasChanges: state.hasChanges(this.endpoint.doc)
    };
  }

  getPeers(): Array<{ peerId: string; stateVector: CrdtStateVector; hasChanges: boolean }> {
    const peerIds = this.getPeerIds();
    const peers = [];
    for (let i = 0; i < peerIds.length; i++) peers[peers.length] = this.getPeerInfo(peerIds[i]);
    return peers;
  }

  subscribe(listener: CrdtSyncProviderEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  addPeer(peerId: string): void {
    assertPeerId(peerId);
    const hadPeer = this.peers.has(peerId);
    this.peers.add(peerId);
    if (!hadPeer) this.emit({ type: 'peer-add', peerId });
  }

  removePeer(peerId: string): boolean {
    assertPeerId(peerId);
    this.endpoint.deletePeer(peerId);
    const deleted = this.peers.delete(peerId);
    if (deleted) this.emit({ type: 'peer-remove', peerId });
    return deleted;
  }

  async connect(): Promise<void> {
    if (this.currentStatus === 'connected') return;
    this.setStatus('connecting');
    if (this.transport?.connect !== undefined) await this.transport.connect();
    await this.subscribeTransport();
    this.setStatus('connected');
    if (this.syncOnConnect) await this.sync();
  }

  async disconnect(): Promise<void> {
    if (this.unsubscribeTransport !== undefined) {
      this.unsubscribeTransport();
      this.unsubscribeTransport = undefined;
    }
    if (this.transport?.disconnect !== undefined) await this.transport.disconnect();
    this.setStatus('disconnected');
  }

  async sync(peerId?: string): Promise<void> {
    const peerIds = peerId === undefined ? this.getPeerIds() : [peerId];
    for (let i = 0; i < peerIds.length; i++) {
      const id = peerIds[i];
      this.addPeer(id);
      const peerState = this.endpoint.getPeerState(id);
      await this.send(id, peerState.hasChanges(this.endpoint.doc)
        ? peerState.createUpdateMessage(this.endpoint.doc)
        : peerState.createStateVectorMessage(this.endpoint.doc));
    }
  }

  async receive(message: CrdtSyncMessageInput, peerId?: string): Promise<CrdtSyncMessage | undefined> {
    if (peerId !== undefined && this.listeners.size === 0) {
      this.addPeer(peerId);
      const input = this.lazyBodies === undefined ? message : await this.hydrateMessage(decodeCrdtSyncMessage(message));
      const reply = this.endpoint.receive(peerId, input);
      if (reply !== undefined) await this.send(peerId, reply);
      return reply;
    }
    const decoded = await this.hydrateMessage(decodeCrdtSyncMessage(message));
    const resolvedPeerId = peerId ?? decoded.senderId;
    if (resolvedPeerId === undefined) throw new TypeError('CRDT sync message is missing senderId');
    this.addPeer(resolvedPeerId);
    this.emit({ type: 'receive', peerId: resolvedPeerId, message: decoded });
    const reply = this.endpoint.receive(resolvedPeerId, decoded);
    if (reply !== undefined) await this.send(resolvedPeerId, reply);
    return reply;
  }

  private async send(peerId: string, message: CrdtSyncMessage): Promise<void> {
    if (this.currentStatus !== 'connected' || this.transport === undefined) return;
    const outbound = await this.createOutboundMessage(message);
    const payload = this.encodeMessages ? encodeCrdtSyncMessage(outbound) : cloneCrdtSyncMessage(outbound);
    this.emit({ type: 'send', peerId, message: outbound });
    await this.transport.send(peerId, payload);
  }

  private async createOutboundMessage(message: CrdtSyncMessage): Promise<CrdtSyncMessage> {
    if (this.lazyBodies === undefined) return cloneCrdtSyncMessage(message);
    const lazy = await loadLazyBodyModule();
    return lazy.createCrdtSyncLazyUpdateMessage(message, this.lazyBodies.store, {
      thresholdBytes: this.lazyBodies.thresholdBytes
    });
  }

  private async hydrateMessage(message: CrdtSyncMessage): Promise<CrdtSyncMessage> {
    if (this.lazyBodies === undefined) return message;
    const lazy = await loadLazyBodyModule();
    return lazy.hydrateCrdtSyncLazyUpdateMessage(message, this.lazyBodies.store);
  }

  private async subscribeTransport(): Promise<void> {
    if (this.transport?.subscribe === undefined || this.unsubscribeTransport !== undefined) return;
    const unsubscribe = await this.transport.subscribe((message, peerId) => this.receive(message, peerId));
    if (typeof unsubscribe === 'function') this.unsubscribeTransport = unsubscribe;
  }

  private setStatus(status: CrdtSyncProviderStatus): void {
    if (this.currentStatus === status) return;
    const previousStatus = this.currentStatus;
    this.currentStatus = status;
    this.emit({ type: 'status', status, previousStatus });
  }

  private emit(event: CrdtSyncProviderEvent): void {
    if (this.listeners.size === 0) return;
    const cloned = cloneCrdtSyncProviderEvent(event);
    this.listeners.forEach((listener) => listener(cloned));
  }
}

function normalizeLazyBodies(
  options: CrdtSyncProviderOptions['lazyBodies']
): Required<CrdtSyncProviderLazyBodyOptions> | undefined {
  if (options === undefined) return undefined;
  if ('put' in options && 'get' in options && 'has' in options) {
    return { store: options as CrdtSyncLazyBodyStoreLike, thresholdBytes: 4096 };
  }
  return {
    store: options.store,
    thresholdBytes: options.thresholdBytes === undefined ? 4096 : Math.max(0, Math.floor(options.thresholdBytes))
  };
}

function loadLazyBodyModule(): Promise<CrdtSyncLazyBodyModule> {
  lazyBodyModulePromise ??= import('./crdt-sync-lazy-body.js');
  return lazyBodyModulePromise;
}

class FrontierCrdtLocalSyncNetwork implements CrdtLocalSyncNetwork {
  private readonly receivers = new Map<string, CrdtSyncMessageReceiver>();

  connect(peerId: string, receiver?: CrdtSyncMessageReceiver): CrdtSyncTransport {
    assertPeerId(peerId);
    if (receiver !== undefined) this.receivers.set(peerId, receiver);
    return new FrontierCrdtLocalSyncTransport(peerId, this.receivers);
  }

  disconnect(peerId: string): boolean {
    assertPeerId(peerId);
    return this.receivers.delete(peerId);
  }

  getPeerIds(): string[] {
    return Array.from(this.receivers.keys()).sort();
  }
}

class FrontierCrdtLocalSyncTransport implements CrdtSyncTransport {
  constructor(
    private readonly senderId: string,
    private readonly receivers: Map<string, CrdtSyncMessageReceiver>
  ) {}

  connect(): void {}

  disconnect(): void {
    this.receivers.delete(this.senderId);
  }

  async send(peerId: string, message: CrdtSyncTransportPayload): Promise<void> {
    const receiver = this.receivers.get(peerId);
    if (receiver === undefined) return;
    await receiver(message, this.senderId);
  }

  subscribe(receiver: CrdtSyncMessageReceiver): () => void {
    this.receivers.set(this.senderId, receiver);
    return () => {
      const current = this.receivers.get(this.senderId);
      if (current === receiver) this.receivers.delete(this.senderId);
    };
  }
}

function cloneCrdtSyncProviderEvent(event: CrdtSyncProviderEvent): CrdtSyncProviderEvent {
  const cloned: CrdtSyncProviderEvent = { type: event.type };
  if (event.peerId !== undefined) cloned.peerId = event.peerId;
  if (event.status !== undefined) cloned.status = event.status;
  if (event.previousStatus !== undefined) cloned.previousStatus = event.previousStatus;
  if (event.message !== undefined) cloned.message = cloneCrdtSyncMessage(event.message);
  return cloned;
}
