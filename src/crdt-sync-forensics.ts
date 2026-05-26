import { cloneJson } from '@shapeshift-labs/frontier/clone';
import {
  createEventLogReplayStorage,
  type EventLogCheckpoint,
  type EventLogReplayStorage,
  type EventLogReplayStorageReadOptions,
  type EventLogReplayStorageStats
} from '@shapeshift-labs/frontier-event-log';
import type {
  CrdtSyncModelCheckResult,
  CrdtSyncModelSnapshot,
  JsonObject,
  JsonValue
} from './types.js';
import type {
  CrdtSyncModelReplayResult,
  CrdtSyncModelScheduleAction
} from './crdt-sync-model.js';

export interface CrdtSyncReplayArtifact {
  kind: 'crdt-sync-replay';
  version: 1;
  id: string;
  seq?: number;
  minimized: boolean;
  actionCount: number;
  schedule: CrdtSyncModelScheduleAction[];
  result?: CrdtSyncModelCheckResult | CrdtSyncModelReplayResult;
  snapshot?: CrdtSyncModelSnapshot;
  metadata?: JsonObject;
}

export interface CrdtSyncReplayArtifactOptions {
  id?: string;
  minimized?: boolean;
  result?: CrdtSyncModelCheckResult | CrdtSyncModelReplayResult;
  snapshot?: CrdtSyncModelSnapshot;
  metadata?: JsonObject;
}

export interface CrdtSyncReplayArtifactStoreSnapshot {
  artifacts: number;
  lastArtifactId?: string;
}

export interface CrdtSyncReplayArtifactStoreOptions {
  capacity?: number;
  now?: () => number;
  initialSnapshot?: CrdtSyncReplayArtifactStoreSnapshot | null;
}

export interface CrdtSyncReplayArtifactStoreReadOptions extends EventLogReplayStorageReadOptions {}

export interface CrdtSyncReplayArtifactStore {
  readonly storage: EventLogReplayStorage<CrdtSyncReplayArtifactStoreSnapshot, CrdtSyncReplayArtifact>;
  append(
    schedule: readonly CrdtSyncModelScheduleAction[],
    options?: CrdtSyncReplayArtifactOptions
  ): CrdtSyncReplayArtifact;
  read(options?: CrdtSyncReplayArtifactStoreReadOptions): CrdtSyncReplayArtifact[];
  checkpoint(snapshot?: CrdtSyncReplayArtifactStoreSnapshot): EventLogCheckpoint<CrdtSyncReplayArtifactStoreSnapshot | null>;
  getStats(): EventLogReplayStorageStats;
}

export function createCrdtSyncReplayArtifact(
  schedule: readonly CrdtSyncModelScheduleAction[],
  options: CrdtSyncReplayArtifactOptions = {}
): CrdtSyncReplayArtifact {
  if (!Array.isArray(schedule)) throw new TypeError('CRDT sync replay schedule must be an array');
  const artifact: CrdtSyncReplayArtifact = {
    kind: 'crdt-sync-replay',
    version: 1,
    id: options.id || 'crdt-sync-replay',
    minimized: options.minimized === true,
    actionCount: schedule.length,
    schedule: cloneJson(schedule as unknown as JsonValue) as unknown as CrdtSyncModelScheduleAction[]
  };
  if (options.result !== undefined) {
    artifact.result = cloneJson(options.result as unknown as JsonValue) as unknown as CrdtSyncModelCheckResult | CrdtSyncModelReplayResult;
  }
  if (options.snapshot !== undefined) {
    artifact.snapshot = cloneJson(options.snapshot as unknown as JsonValue) as unknown as CrdtSyncModelSnapshot;
  }
  if (options.metadata !== undefined) artifact.metadata = cloneJson(options.metadata);
  return artifact;
}

export function createCrdtSyncReplayArtifactStore(
  options: CrdtSyncReplayArtifactStoreOptions = {}
): CrdtSyncReplayArtifactStore {
  const storage = createEventLogReplayStorage<CrdtSyncReplayArtifactStoreSnapshot, CrdtSyncReplayArtifact>({
    capacity: options.capacity,
    now: options.now,
    initialSnapshot: options.initialSnapshot || { artifacts: 0 }
  });
  let nextSeq = Math.max(0, Math.floor(storage.load()?.artifacts || 0));

  function append(
    schedule: readonly CrdtSyncModelScheduleAction[],
    artifactOptions: CrdtSyncReplayArtifactOptions = {}
  ): CrdtSyncReplayArtifact {
    const seq = ++nextSeq;
    const artifact = createCrdtSyncReplayArtifact(schedule, {
      ...artifactOptions,
      id: artifactOptions.id || 'crdt-sync-replay:' + seq
    });
    artifact.seq = seq;
    storage.appendChange(artifact);
    storage.save({ artifacts: seq, lastArtifactId: artifact.id });
    return cloneJson(artifact as unknown as JsonValue) as unknown as CrdtSyncReplayArtifact;
  }

  function read(options: CrdtSyncReplayArtifactStoreReadOptions = {}): CrdtSyncReplayArtifact[] {
    return storage.readChangeLog(options);
  }

  function checkpoint(snapshot?: CrdtSyncReplayArtifactStoreSnapshot): EventLogCheckpoint<CrdtSyncReplayArtifactStoreSnapshot | null> {
    return storage.compact(snapshot || storage.load() || { artifacts: nextSeq });
  }

  function getStats(): EventLogReplayStorageStats {
    return storage.getStats();
  }

  return {
    storage,
    append,
    read,
    checkpoint,
    getStats
  };
}
