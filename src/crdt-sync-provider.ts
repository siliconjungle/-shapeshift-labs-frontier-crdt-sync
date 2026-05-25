import {
  assertPeerId,
  cloneCrdtSyncMessage,
  decodeCrdtSyncMessage,
  encodeCrdtSyncMessage
} from './crdt-sync-wire.js';
import type {
  CrdtLocalSyncNetwork,
  CrdtStateVector,
  CrdtSyncEndpoint,
  CrdtSyncMessage,
  CrdtSyncMessageInput,
  CrdtSyncMessageReceiver,
  CrdtSyncProvider,
  CrdtSyncProviderEvent,
  CrdtSyncProviderEventListener,
  CrdtSyncProviderOptions,
  CrdtSyncProviderStatus,
  CrdtSyncTransport,
  CrdtSyncTransportPayload
} from './types.js';

export function createCrdtSyncProvider(endpoint: CrdtSyncEndpoint, options?: CrdtSyncProviderOptions): CrdtSyncProvider {
  return new FrontierCrdtSyncProvider(endpoint, options);
}

export function createCrdtLocalSyncNetwork(): CrdtLocalSyncNetwork {
  return new FrontierCrdtLocalSyncNetwork();
}

class FrontierCrdtSyncProvider implements CrdtSyncProvider {
  private readonly peers = new Set<string>();
  private readonly transport?: CrdtSyncProviderOptions['transport'];
  private readonly encodeMessages: boolean;
  private readonly syncOnConnect: boolean;
  private readonly listeners = new Set<CrdtSyncProviderEventListener>();
  private unsubscribeTransport: (() => void) | undefined;
  private currentStatus: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  constructor(readonly endpoint: CrdtSyncEndpoint, options?: CrdtSyncProviderOptions) {
    this.transport = options?.transport;
    this.encodeMessages = options?.encodeMessages !== false;
    this.syncOnConnect = options?.syncOnConnect === true;
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
    const decoded = decodeCrdtSyncMessage(message);
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
    const payload = this.encodeMessages ? encodeCrdtSyncMessage(message) : cloneCrdtSyncMessage(message);
    this.emit({ type: 'send', peerId, message });
    await this.transport.send(peerId, payload);
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
