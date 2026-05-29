import type {
  CrdtActorId,
  CrdtChangeOptions,
  CrdtCommitResult,
  CrdtCommitMetadataEntry,
  CrdtDocument,
  CrdtDocumentOptions,
  CrdtSnapshot,
  CrdtSnapshotOptions,
  CrdtStateVector,
  CrdtTransaction,
  CrdtUpdateInput,
  CrdtVersion,
  DiffOptions,
  JsonArray,
  JsonObject,
  JsonPath,
  JsonValue,
  PathSegment,
  WatchPath
} from '@shapeshift-labs/frontier-crdt';

export type {
  CrdtActorId,
  CrdtChangeOptions,
  CrdtCommitResult,
  CrdtCommitMetadataEntry,
  CrdtDocument,
  CrdtDocumentOptions,
  CrdtSnapshot,
  CrdtSnapshotOptions,
  CrdtStateVector,
  CrdtTransaction,
  CrdtUpdateInput,
  CrdtVersion,
  DiffOptions,
  JsonArray,
  JsonObject,
  JsonPath,
  JsonValue,
  PathSegment,
  WatchPath
} from '@shapeshift-labs/frontier-crdt';

export interface CrdtSyncStateOptions {
  
  stateVector?: CrdtStateVector | null;

  
  actorRangeSync?: boolean;

  
  documentId?: string;

  
  senderId?: string;
}

export interface CrdtSyncGhostStateOptions {
  stateVector?: CrdtStateVector | null;
  ackedRanges?: CrdtSyncActorRange[] | null;
  ghostRanges?: CrdtSyncActorRange[] | null;
  pendingRanges?: CrdtSyncActorRange[] | null;
}

export type CrdtSyncMessageType = 'state-vector' | 'update' | 'ack';

export interface CrdtSyncActorRange {
  actor: CrdtActorId;
  start: number;
  end: number;
}

export type CrdtSyncReconciliationStrategy = 'merkle-iblt';

export interface CrdtSyncReconciliationCell {
  actor: CrdtActorId;
  start: number;
  end: number;
  count: number;
  hash: number;
}

export interface CrdtSyncReconciliation {
  version: 1;
  strategy: CrdtSyncReconciliationStrategy;
  bucketSize: number;
  rangeCount: number;
  opCount: number;
  cells: CrdtSyncReconciliationCell[];
}

export interface CrdtSyncMessage {
  type: CrdtSyncMessageType;
  
  documentId?: string;
  
  senderId?: string;
  
  stateVector: CrdtStateVector;
  
  actorRanges?: CrdtSyncActorRange[];
  
  reconciliation?: CrdtSyncReconciliation;

  update?: Uint8Array;

  updateBody?: CrdtSyncLazyBodyReference;
}

export interface CrdtSyncLazyBodyReference {
  version: 1;
  kind: 'crdt-update';
  hash: string;
  byteLength: number;
  stateVector: CrdtStateVector;
  actorRanges: CrdtSyncActorRange[];
}

export interface CrdtSyncLazyBodyStoreLike {
  put(update: CrdtUpdateInput): CrdtSyncLazyBodyReference;
  get(reference: CrdtSyncLazyBodyReference): Uint8Array | undefined;
  has(reference: CrdtSyncLazyBodyReference): boolean;
}

export interface CrdtSyncGhostDelta {
  update: Uint8Array;
  ranges: CrdtSyncActorRange[];
  basisRanges: CrdtSyncActorRange[];
  targetRanges: CrdtSyncActorRange[];
  stateVector: CrdtStateVector;
}

export type CrdtSyncMessageInput =
  | CrdtSyncMessage
  | ArrayBuffer
  | ArrayBufferView
  | string;

export interface CrdtSyncState {
  
  getStateVector(): CrdtStateVector;

  
  setStateVector(stateVector?: CrdtStateVector | null): void;

  
  updateStateVector(stateVector?: CrdtStateVector | null): CrdtStateVector;

  
  hasChanges(doc: CrdtDocument): boolean;

  
  encodeUpdate(doc: CrdtDocument): Uint8Array;

  
  markUpdateKnown(update: CrdtUpdateInput): CrdtStateVector;

  
  markDocumentSynced(doc: CrdtDocument): CrdtStateVector;

  
  applyUpdate(doc: CrdtDocument, update: CrdtUpdateInput): CrdtCommitResult;

  
  createStateVectorMessage(doc: CrdtDocument): CrdtSyncMessage;

  
  createUpdateMessage(doc: CrdtDocument): CrdtSyncMessage;

  
  createAckMessage(doc: CrdtDocument): CrdtSyncMessage;

  
  receiveMessage(doc: CrdtDocument, message: CrdtSyncMessageInput): CrdtSyncMessage | undefined;
}

export interface CrdtSyncGhostState {
  getAckedActorRanges(): CrdtSyncActorRange[];
  getGhostActorRanges(): CrdtSyncActorRange[];
  getPendingActorRanges(): CrdtSyncActorRange[];
  reset(options?: CrdtSyncGhostStateOptions | null): void;
  markAcked(ranges?: readonly CrdtSyncActorRange[] | CrdtStateVector | null): CrdtSyncActorRange[];
  markUpdateAcked(update: CrdtUpdateInput): CrdtSyncActorRange[];
  markDocumentAcked(doc: CrdtDocument): CrdtSyncActorRange[];
  createDelta(doc: CrdtDocument): CrdtSyncGhostDelta | undefined;
  createRepairDelta(doc: CrdtDocument): CrdtSyncGhostDelta | undefined;
}

export type CrdtSyncPeerStates = Record<string, CrdtStateVector>;

export interface CrdtSyncEndpointOptions extends CrdtSyncStateOptions {
  
  peers?: CrdtSyncPeerStates;
}

export interface CrdtSyncEndpoint {
  readonly doc: CrdtDocument;
  readonly documentId?: string;
  readonly peerId?: string;
  getPeerIds(): string[];
  getPeerStateVectors(): CrdtSyncPeerStates;
  setPeerStateVectors(peers?: CrdtSyncPeerStates | null): void;
  getPeerState(peerId: string): CrdtSyncState;
  getPeerStateVector(peerId: string): CrdtStateVector;
  setPeerStateVector(peerId: string, stateVector?: CrdtStateVector | null): void;
  markPeerSynced(peerId: string): CrdtStateVector;
  deletePeer(peerId: string): boolean;
  open(peerId: string): CrdtSyncMessage;
  createUpdate(peerId: string): CrdtSyncMessage;
  receive(message: CrdtSyncMessageInput): CrdtSyncMessage | undefined;
  receive(peerId: string, message: CrdtSyncMessageInput): CrdtSyncMessage | undefined;
}

export interface CrdtDocumentUrlOptions {
  peerId?: string;
  branch?: string;
  version?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
}

export interface CrdtDocumentUrlParts {
  documentId: string;
  peerId?: string;
  branch?: string;
  version?: string;
  params: Record<string, string>;
}

export interface CrdtStorageAdapter {
  loadSnapshot(documentId: string): CrdtSnapshot | undefined | Promise<CrdtSnapshot | undefined>;
  saveSnapshot(documentId: string, snapshot: CrdtSnapshot): void | Promise<void>;
  appendUpdate(documentId: string, update: CrdtUpdateInput): void | Promise<void>;
  replaceUpdates?(documentId: string, updates: readonly CrdtUpdateInput[]): void | Promise<void>;
  compact?(documentId: string, snapshot: CrdtSnapshot, updates?: readonly CrdtUpdateInput[]): void | Promise<void>;
  loadUpdates(documentId: string, stateVector?: CrdtStateVector | null): Uint8Array[] | Promise<Uint8Array[]>;
  loadMergedUpdate?(documentId: string, stateVector?: CrdtStateVector | null): Uint8Array | Promise<Uint8Array>;
  deleteDocument(documentId: string): boolean | void | Promise<boolean | void>;
  listDocuments?(): string[] | Promise<string[]>;
  subscribe?(listener: CrdtStorageEventListener, documentId?: string): () => void;
}

export type CrdtStorageEventType =
  | 'snapshot'
  | 'append-update'
  | 'replace-updates'
  | 'compact'
  | 'delete';

export interface CrdtStorageEvent {
  type: CrdtStorageEventType;
  documentId: string;
  snapshot?: CrdtSnapshot;
  update?: Uint8Array;
  updateCount?: number;
  deleted?: boolean;
}

export type CrdtStorageEventListener = (event: CrdtStorageEvent) => void;

export interface CrdtStorageCompactionOptions {
  
  includeMetadata?: boolean;

  
  includeView?: boolean;

  
  keepSnapshotUpdate?: boolean;
}

export interface CrdtStorageCompactionResult {
  documentId: string;
  snapshot: CrdtSnapshot;
  beforeUpdateCount: number;
  afterUpdateCount: number;
  updateBytesBefore: number;
  updateBytesAfter: number;
  snapshotBytes: number;
  compactedUpdates: boolean;
}

export type CrdtSyncProviderStatus = 'disconnected' | 'connecting' | 'connected';

export type CrdtSyncTransportPayload = CrdtSyncMessage | Uint8Array;

export interface CrdtSyncTransport {
  connect?(): void | Promise<void>;
  disconnect?(): void | Promise<void>;
  send(peerId: string, message: CrdtSyncTransportPayload): void | Promise<void>;
  subscribe?(receiver: CrdtSyncMessageReceiver): void | (() => void) | Promise<void | (() => void)>;
}

export type CrdtSyncMessageReceiver = (
  message: CrdtSyncTransportPayload,
  peerId: string
) => void | CrdtSyncMessage | Promise<void | CrdtSyncMessage>;

export interface CrdtLocalSyncNetwork {
  connect(peerId: string, receiver?: CrdtSyncMessageReceiver): CrdtSyncTransport;
  disconnect(peerId: string): boolean;
  getPeerIds(): string[];
}

export type CrdtSyncModelEventType =
  | 'connect'
  | 'disconnect'
  | 'send'
  | 'deliver'
  | 'drop'
  | 'duplicate'
  | 'partition'
  | 'heal'
  | 'error';

export interface CrdtSyncModelEvent {
  step: number;
  type: CrdtSyncModelEventType;
  fromPeerId?: string;
  toPeerId?: string;
  messageId?: number;
  messageType?: CrdtSyncMessageType;
  documentId?: string;
  queueLength?: number;
  error?: string;
}

export interface CrdtSyncQueuedMessage {
  id: number;
  fromPeerId: string;
  toPeerId: string;
  message: CrdtSyncMessage;
}

export interface CrdtSyncModelDrainOptions {
  maxSteps?: number;
}

export interface CrdtSyncModelCheckResult {
  valid: boolean;
  delivered: number;
  dropped: number;
  duplicated: number;
  pending: number;
  errors: string[];
  history: CrdtSyncModelEvent[];
}

export interface CrdtSyncModelSnapshot {
  peerIds: string[];
  partitions: Array<[string, string]>;
  queued: CrdtSyncQueuedMessage[];
  delivered: number;
  dropped: number;
  duplicated: number;
  pending: number;
  errors: string[];
  history: CrdtSyncModelEvent[];
}

export interface CrdtSyncModelChecker extends CrdtLocalSyncNetwork {
  partition(left: string | readonly string[], right: string | readonly string[]): void;
  heal(left?: string | readonly string[], right?: string | readonly string[]): void;
  isPartitioned(fromPeerId: string, toPeerId: string): boolean;
  duplicateNext(count?: number): number;
  dropNext(count?: number): number;
  deliver(messageId: number): Promise<CrdtSyncQueuedMessage | undefined>;
  deliverNext(): Promise<CrdtSyncQueuedMessage | undefined>;
  drain(options?: CrdtSyncModelDrainOptions): Promise<CrdtSyncModelCheckResult>;
  queueSnapshot(): CrdtSyncQueuedMessage[];
  snapshot(): CrdtSyncModelSnapshot;
  history(): CrdtSyncModelEvent[];
  clearHistory(): void;
}

export interface CrdtSyncConvergencePeer {
  peerId: string;
  view: JsonValue;
  stateVector?: CrdtStateVector;
}

export type CrdtSyncConvergenceTarget =
  | CrdtDocument
  | CrdtDocHandle
  | CrdtSyncConvergencePeer;

export interface CrdtSyncConvergenceMismatch {
  peerId: string;
  expectedPeerId: string;
  kind: 'view' | 'state-vector';
  expected: JsonValue | CrdtStateVector;
  actual: JsonValue | CrdtStateVector;
}

export interface CrdtSyncConvergenceResult {
  valid: boolean;
  peers: CrdtSyncConvergencePeer[];
  mismatches: CrdtSyncConvergenceMismatch[];
}

export interface CrdtSyncProviderOptions {
  transport?: CrdtSyncTransport;
  peers?: string[];
  encodeMessages?: boolean;
  syncOnConnect?: boolean;
  lazyBodies?: CrdtSyncLazyBodyStoreLike | CrdtSyncProviderLazyBodyOptions;
}

export interface CrdtSyncProviderLazyBodyOptions {
  store: CrdtSyncLazyBodyStoreLike;
  thresholdBytes?: number;
}

export interface CrdtSyncPeerInfo {
  peerId: string;
  stateVector: CrdtStateVector;
  hasChanges: boolean;
}

export type CrdtSyncProviderEventType =
  | 'status'
  | 'peer-add'
  | 'peer-remove'
  | 'send'
  | 'receive';

export interface CrdtSyncProviderEvent {
  type: CrdtSyncProviderEventType;
  peerId?: string;
  status?: CrdtSyncProviderStatus;
  previousStatus?: CrdtSyncProviderStatus;
  message?: CrdtSyncMessage;
}

export type CrdtSyncProviderEventListener = (event: CrdtSyncProviderEvent) => void;

export interface CrdtSyncProvider {
  readonly endpoint: CrdtSyncEndpoint;
  readonly status: CrdtSyncProviderStatus;
  getPeerIds(): string[];
  getPeerInfo(peerId: string): CrdtSyncPeerInfo;
  getPeers(): CrdtSyncPeerInfo[];
  subscribe(listener: CrdtSyncProviderEventListener): () => void;
  addPeer(peerId: string): void;
  removePeer(peerId: string): boolean;
  connect(): void | Promise<void>;
  disconnect(): void | Promise<void>;
  sync(peerId?: string): void | Promise<void>;
  receive(message: CrdtSyncMessageInput, peerId?: string): void | CrdtSyncMessage | Promise<void | CrdtSyncMessage>;
}

export type CrdtDocHandleUpdateSource = 'local' | 'remote' | 'storage';

export interface CrdtDocHandleUpdate {
  source: CrdtDocHandleUpdateSource;
  documentId: string;
  peerId?: string;
  update: Uint8Array;
  result: CrdtCommitResult;
}

export type CrdtDocHandleUpdateListener = (event: CrdtDocHandleUpdate) => void;

export interface CrdtDocHandleOptions extends CrdtDocumentOptions {
  documentId: string;
  peerId?: string;
  doc?: CrdtDocument;
  storage?: CrdtStorageAdapter;
  sync?: CrdtSyncProviderOptions;
}

export interface CrdtDocHandle {
  readonly documentId: string;
  readonly peerId?: string;
  readonly url: string;
  readonly doc: CrdtDocument;
  readonly endpoint: CrdtSyncEndpoint;
  readonly storage?: CrdtStorageAdapter;
  readonly provider?: CrdtSyncProvider;
  toJSON(): JsonValue;
  subscribe(listener: CrdtDocHandleUpdateListener): () => void;
  change(callback: (tx: CrdtTransaction) => void, options?: CrdtChangeOptions): Promise<CrdtCommitResult>;
  set(path: WatchPath, value: JsonValue): Promise<CrdtCommitResult>;
  delete(path: WatchPath): Promise<CrdtCommitResult>;
  recordLocalUpdate(result: CrdtCommitResult): Promise<CrdtCommitResult>;
  applyUpdate(update: CrdtUpdateInput, peerId?: string): Promise<CrdtCommitResult>;
  receiveSyncMessage(message: CrdtSyncMessageInput, peerId?: string): Promise<CrdtSyncMessage | undefined>;
  load(): Promise<CrdtCommitResult | undefined>;
  saveSnapshot(options?: CrdtSnapshotOptions): Promise<CrdtSnapshot>;
  compactStorage(options?: CrdtStorageCompactionOptions): Promise<CrdtStorageCompactionResult>;
}

export interface CrdtTextBindingChange {
  index?: number;
  deleteCount?: number;
  insert?: string;
  text?: string;
}

export interface CrdtTextBindingAdapter {
  getText(): string;
  replaceText(index: number, deleteCount: number, text: string): void;
  onChange(listener: (change: CrdtTextBindingChange) => void | Promise<void>): () => void;
}

export type CrdtTextBindingInitialSync = 'doc-to-editor' | 'editor-to-doc' | 'none';

export interface CrdtTextBindingOptions {
  initialSync?: CrdtTextBindingInitialSync;
}

export interface CrdtTextBinding {
  readonly handle: CrdtDocHandle;
  readonly path: JsonPath;
  readonly adapter: CrdtTextBindingAdapter;
  isStarted(): boolean;
  start(): Promise<void>;
  stop(): void;
  syncFromDocument(): void;
  syncToDocument(): Promise<CrdtCommitResult | undefined>;
  applyLocalChange(change: CrdtTextBindingChange): Promise<CrdtCommitResult | undefined>;
}

export interface CrdtRepoOptions {
  peerId?: string;
  storage?: CrdtStorageAdapter;
  sync?: CrdtSyncProviderOptions;
  syncState?: CrdtRepoSyncState;
}

export type CrdtRepoSyncState = Record<string, CrdtSyncPeerStates>;

export interface CrdtRepoOpenOptions extends CrdtDocumentOptions {
  peerId?: string;
  storage?: CrdtStorageAdapter;
  sync?: CrdtSyncProviderOptions;
  load?: boolean;
}

export interface CrdtRepo {
  readonly peerId?: string;
  readonly storage?: CrdtStorageAdapter;
  getDocumentIds(): string[];
  listStoredDocuments(): Promise<string[]>;
  getSyncState(): CrdtRepoSyncState;
  loadSyncState(state?: CrdtRepoSyncState | null): void;
  get(documentIdOrUrl: string): CrdtDocHandle | undefined;
  subscribe(listener: CrdtRepoEventListener): () => void;
  create(documentId: string, options?: CrdtRepoOpenOptions): CrdtDocHandle;
  open(documentIdOrUrl: string, options?: CrdtRepoOpenOptions): Promise<CrdtDocHandle>;
  openStoredDocuments(options?: CrdtRepoOpenOptions): Promise<CrdtDocHandle[]>;
  connectAll(): Promise<void>;
  syncAll(peerId?: string): Promise<void>;
  disconnectAll(): Promise<void>;
  close(documentIdOrUrl: string): boolean;
  delete(documentIdOrUrl: string): Promise<boolean | void>;
  receive(message: CrdtSyncMessageInput, peerId?: string): Promise<CrdtSyncMessage | undefined>;
}

export type CrdtRepoEventType = 'open' | 'close' | 'delete' | 'update';

export interface CrdtRepoEvent {
  type: CrdtRepoEventType;
  documentId: string;
  handle?: CrdtDocHandle;
  update?: CrdtDocHandleUpdate;
}

export type CrdtRepoEventListener = (event: CrdtRepoEvent) => void;
