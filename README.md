# Frontier CRDT Sync

Sync protocol, repo, storage, provider, and binding contracts for Frontier CRDT documents.

This package sits above [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt). It keeps transport, persistence, document handles, local sync networks, model-checking helpers, and editor-facing sync bindings out of the core CRDT document package.

- npm: [`@shapeshift-labs/frontier-crdt-sync`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-sync)
- source: [`siliconjungle/-shapeshift-labs-frontier-crdt-sync`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync)
- license: MIT

## Related Packages

The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:

- [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier): Core JSON diff/apply, compact patch tuples, JSON Pointer, equality, clone, validation, Unicode helpers.
- [`@shapeshift-labs/frontier-query`](https://www.npmjs.com/package/@shapeshift-labs/frontier-query): Shared query-key, selector path, condition, entity identity, and table-shape primitives.
- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec): Patch serialization, binary frames, canonical JSON, and patch-history codecs.
- [`@shapeshift-labs/frontier-engine`](https://www.npmjs.com/package/@shapeshift-labs/frontier-engine): Stateful planned diff engine, adaptive profiles, schema plans, and engine-level history helpers.
- [`@shapeshift-labs/frontier-state`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state): Patch-routed app-state subscriptions, owned commits, maintained views, and path mapping.
- [`@shapeshift-labs/frontier-state-cache`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache): Normalized query-result cache with entity/query watchers, persistence, change logs, optimistic layers, and mutation bridge.
- [`@shapeshift-labs/frontier-state-cache-idb`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-idb): IndexedDB persistence adapter for Frontier state-cache snapshots.
- [`@shapeshift-labs/frontier-state-cache-file`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-file): Structured file persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-state-cache-sql`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-sql): SQL persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-schema`](https://www.npmjs.com/package/@shapeshift-labs/frontier-schema): JSON Schema validation, Frontier profile generation, CloudEvent envelopes, and query/table schema helpers.
- [`@shapeshift-labs/frontier-event-log`](https://www.npmjs.com/package/@shapeshift-labs/frontier-event-log): Bounded event logs, replay cursors, consumer acknowledgements, keyed compaction, checkpoints, and Frontier patch event records.
- [`@shapeshift-labs/frontier-logging`](https://www.npmjs.com/package/@shapeshift-labs/frontier-logging): Opt-in structured logging, browser telemetry, file sinks, exporters, benchmark traces, and Frontier patch/update summaries.
- [`@shapeshift-labs/frontier-mutation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation): Explicit mutation and selector plans compiled to Frontier patches or CRDT operations.
- [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt): Native CRDT documents, update tooling, awareness, branches, conflict introspection, version frames, and undo.
- [`@shapeshift-labs/frontier-crdt-websocket`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-websocket): WebSocket client/server transports for Frontier CRDT sync providers.
- [`@shapeshift-labs/frontier-react`](https://www.npmjs.com/package/@shapeshift-labs/frontier-react): React external-store hooks and adapters for Frontier state, cache, and CRDT surfaces.
- [`@shapeshift-labs/frontier-richtext`](https://www.npmjs.com/package/@shapeshift-labs/frontier-richtext): Rich text Delta normalization/application, marks, embeds, ranges, and cursor/selection transforms for local editor integrations.
- [`@shapeshift-labs/frontier-realtime`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime): Shared realtime command, tick, snapshot, prediction, reconciliation, interpolation, rollback, message, and delta primitives.
- [`@shapeshift-labs/frontier-realtime-server`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime-server): Authoritative realtime room, tick, command validation, rate-limit, session, and snapshot-history runtime.
- [`@shapeshift-labs/frontier-realtime-websocket`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime-websocket): WebSocket client, wire, and Node room-server transport for Frontier realtime.
- [`@shapeshift-labs/frontier-game`](https://www.npmjs.com/package/@shapeshift-labs/frontier-game): Game-facing entity, component, player, room, ownership, spatial interest, rollback, physics, and replication helpers above realtime.

Package source repositories:

- [`siliconjungle/-shapeshift-labs-frontier`](https://github.com/siliconjungle/-shapeshift-labs-frontier)
- [`siliconjungle/-shapeshift-labs-frontier-query`](https://github.com/siliconjungle/-shapeshift-labs-frontier-query)
- [`siliconjungle/-shapeshift-labs-frontier-codec`](https://github.com/siliconjungle/-shapeshift-labs-frontier-codec)
- [`siliconjungle/-shapeshift-labs-frontier-engine`](https://github.com/siliconjungle/-shapeshift-labs-frontier-engine)
- [`siliconjungle/-shapeshift-labs-frontier-state`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-idb`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-idb)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-file`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-file)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-sql`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-sql)
- [`siliconjungle/-shapeshift-labs-frontier-schema`](https://github.com/siliconjungle/-shapeshift-labs-frontier-schema)
- [`siliconjungle/-shapeshift-labs-frontier-event-log`](https://github.com/siliconjungle/-shapeshift-labs-frontier-event-log)
- [`siliconjungle/-shapeshift-labs-frontier-logging`](https://github.com/siliconjungle/-shapeshift-labs-frontier-logging)
- [`siliconjungle/-shapeshift-labs-frontier-mutation`](https://github.com/siliconjungle/-shapeshift-labs-frontier-mutation)
- [`siliconjungle/-shapeshift-labs-frontier-crdt`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt)
- [`siliconjungle/-shapeshift-labs-frontier-crdt-sync`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync)
- [`siliconjungle/-shapeshift-labs-frontier-crdt-websocket`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-websocket)
- [`siliconjungle/-shapeshift-labs-frontier-react`](https://github.com/siliconjungle/-shapeshift-labs-frontier-react)
- [`siliconjungle/-shapeshift-labs-frontier-richtext`](https://github.com/siliconjungle/-shapeshift-labs-frontier-richtext)
- [`siliconjungle/-shapeshift-labs-frontier-realtime`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime)
- [`siliconjungle/-shapeshift-labs-frontier-realtime-server`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime-server)
- [`siliconjungle/-shapeshift-labs-frontier-realtime-websocket`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime-websocket)
- [`siliconjungle/-shapeshift-labs-frontier-game`](https://github.com/siliconjungle/-shapeshift-labs-frontier-game)

## Install

```sh
npm install @shapeshift-labs/frontier @shapeshift-labs/frontier-crdt @shapeshift-labs/frontier-crdt-sync
```

## Usage

```ts
import { createCrdtDocument } from '@shapeshift-labs/frontier-crdt';
import {
  createCrdtSyncEndpoint,
  encodeCrdtSyncMessage,
  decodeCrdtSyncMessage
} from '@shapeshift-labs/frontier-crdt-sync';

const alice = createCrdtDocument({ actorId: 'alice' });
const bob = createCrdtDocument({ actorId: 'bob' });

alice.set('/title', 'Draft');

const aliceSync = createCrdtSyncEndpoint(alice, {
  documentId: 'doc-1',
  senderId: 'alice'
});
const bobSync = createCrdtSyncEndpoint(bob, {
  documentId: 'doc-1',
  senderId: 'bob'
});

const hello = bobSync.open('alice');
const update = aliceSync.receive('bob', hello);

if (update) {
  bobSync.receive('alice', decodeCrdtSyncMessage(encodeCrdtSyncMessage(update)));
}

console.log(bob.toJSON());
```

## API

```ts
import {
  createCrdtSyncState,
  createCrdtSyncEndpoint,
  createCrdtSyncProvider,
  createCrdtDocHandle,
  createCrdtRepo,
  createCrdtMemoryStorageAdapter,
  compactCrdtStorage,
  createCrdtDocumentUrl,
  parseCrdtDocumentUrl,
  createCrdtLocalSyncNetwork,
  createCrdtSyncModelChecker,
  checkCrdtSyncConvergence,
  createCrdtTextBinding,
  encodeCrdtSyncMessage,
  decodeCrdtSyncMessage
} from '@shapeshift-labs/frontier-crdt-sync';
```

## Subpath Imports

The package currently exposes focused subpaths for the planned package story:

```ts
import { createCrdtSyncEndpoint } from '@shapeshift-labs/frontier-crdt-sync/sync';
import { createCrdtRepo } from '@shapeshift-labs/frontier-crdt-sync/repo';
import { createCrdtMemoryStorageAdapter } from '@shapeshift-labs/frontier-crdt-sync/storage';
import { createCrdtSyncProvider } from '@shapeshift-labs/frontier-crdt-sync/provider';
import {
  createCrdtSyncModelChecker,
  replayCrdtSyncModelReproScenario,
  minimizeCrdtSyncModelReproScenario,
  createCrdtSyncModelReproArtifact,
  replayCrdtSyncModelSchedule,
  minimizeCrdtSyncModelSchedule
} from '@shapeshift-labs/frontier-crdt-sync/model';
import { createCrdtSyncReplayArtifactStore } from '@shapeshift-labs/frontier-crdt-sync/forensics';
import { createCrdtTextBinding } from '@shapeshift-labs/frontier-crdt-sync/text-binding';
```

Each subpath has its own narrow package entry and export surface. The implementation still shares the same sync runtime internally while the module boundaries settle.

## Failure Forensics

The `./model` subpath can replay and minimize sync failure histories as reproducible artifacts:

```ts
import {
  replayCrdtSyncModelReproScenario,
  minimizeCrdtSyncModelReproScenario,
  createCrdtSyncModelReproArtifact
} from '@shapeshift-labs/frontier-crdt-sync/model';

const scenario = {
  documentId: 'case-1',
  peers: [
    {
      peerId: 'alice',
      history: [{ type: 'set', path: '/title', value: 'long failing title' }]
    },
    { peerId: 'bob', history: [] },
    { peerId: 'noise', history: [{ type: 'set', path: '/tmp', value: 'remove me' }] }
  ],
  schedule: [
    { type: 'sync', from: 'alice', to: 'bob' },
    { type: 'drop-next', count: 3 },
    { type: 'deliver-next' }
  ]
} as const;

const minimized = await minimizeCrdtSyncModelReproScenario(scenario, async (candidate) => {
  const replay = await replayCrdtSyncModelReproScenario(candidate);
  return !replay.convergence.valid;
});

const artifact = createCrdtSyncModelReproArtifact(minimized, { original: scenario });
```

The minimizer keeps the predicate true while shrinking peer count, per-peer operation histories, operation payloads/indexes/counts, and network schedule actions. The artifact is plain JSON with a stable `kind`, summaries for original/minimized cases, replay status when provided, and the minimized scenario that can be checked back into a fuzzer corpus or attached to an issue.

The package fuzzer records CRDT operations and sync steps while it runs. If convergence fails, it writes a minimized repro artifact to `FRONTIER_CRDT_SYNC_REPRO_DIR` when set, otherwise to the OS temp directory under `frontier-crdt-sync-repros`.

## Replay Artifact Store

The `./forensics` subpath stores minimized model-checker schedules in an event-log-owned replay artifact store:

```ts
import { createCrdtSyncReplayArtifactStore } from '@shapeshift-labs/frontier-crdt-sync/forensics';

const store = createCrdtSyncReplayArtifactStore();
const artifact = store.append([{ type: 'drain', maxSteps: 32 }], {
  minimized: true,
  metadata: { source: 'fuzzer' }
});
const checkpoint = store.checkpoint();
```

The store is intentionally off the root import. It keeps CRDT sync failure artifacts as snapshot-plus-bounded-change-log data owned by `@shapeshift-labs/frontier-event-log`, while the model-checker remains responsible for generating and minimizing schedules.

## Protocol Spec

The sync protocol is transport-agnostic. A transport carries either decoded message objects or bytes from `encodeCrdtSyncMessage()`.

Encoded messages are JSON envelopes with:

- `magic: "frontier-crdt-sync"`
- `version: 1`
- `type: "state-vector" | "update" | "ack"`
- `stateVector`: the sender's known CRDT state vector
- optional `documentId`, `senderId`, `actorRanges`, and base64 update bytes

Peer lifecycle:

1. `endpoint.open(peerId)` sends a `state-vector` message.
2. The receiver replies with `update` when it has missing operations, otherwise `ack`.
3. An `update` receiver applies the CRDT update idempotently, advances peer knowledge, and replies with its own `update` or `ack`.
4. An `ack` receiver advances peer knowledge and replies only if it still has changes for that peer.
5. Reconnects are ordinary `open()` calls; deleting peer state resets the next exchange to an empty known vector.

Idempotence and ordering:

- Duplicate `state-vector`, `update`, and `ack` messages are safe.
- Updates are CRDT operation updates and may arrive after reordering or reconnection.
- Messages with the wrong `documentId` are rejected by endpoints.
- Missing peers, disconnected transports, and model-checker partitions drop messages; reconnect by attaching the peer again and sending a new `open()`.

Capabilities and fallback:

- `actorRangeSync: true` adds `actorRanges` to messages and lets peers request sparse actor ranges.
- Peers that do not send actor ranges fall back to state-vector behavior.
- The current wire version is intentionally small. Cross-version wire compatibility is not promised until the sync protocol is declared stable.

Storage contract:

- `appendUpdate()` appends one CRDT update entry. The memory adapter preserves awaited append order, including async object-to-bytes updates.
- `saveSnapshot()` writes a snapshot independently from the update log.
- `compact()` atomically replaces the snapshot and update log for a document.
- `createCrdtMemoryStorageAdapter({ validateUpdates: true })` validates update bytes before commit and rejects corrupted entries without mutating the stored log.
- Without validation, corrupted entries can still be stored, but replay/load will reject them when the CRDT update decoder reads them.

## Package Scope

This package is intentionally limited to:

- Sync states, endpoint messages, and encoded sync message envelopes.
- Transport-agnostic providers.
- Document handles, repos, document URLs, and memory storage.
- Storage compaction helpers.
- Local sync networks, model-checking helpers, and convergence checks.
- Replay artifact storage for minimized sync schedules and repro metadata.
- Plain text binding contracts.

It does not expose logging, schema validation, app-state subscriptions, concrete network transports, or the small JSON diff/apply core API. Use [`@shapeshift-labs/frontier-crdt-websocket`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-websocket) for WebSocket client/server wiring.

## TypeScript

The package ships ESM JavaScript plus `.d.ts` declarations for the root export and public subpaths. The package-local TypeScript source lives in `src/` and compiles directly to `dist/`.

## Validation

```sh
npm test
npm run fuzz
npm run soak
npm run bench
npm run pack:dry
```

`npm test` includes smoke coverage, protocol/storage hardening, a deterministic model-checking soak, and the standard fuzzer. `npm run fuzz` raises the randomized sync and soak coverage. `npm run soak` runs a longer deterministic network schedule pass with packet loss, reordering, duplication, reconnects, peer churn, storage restores, and partial compaction paths.

## Benchmarks

Run the package-local benchmark:

```sh
npm run bench
```

Latest local package benchmark on Node v26.1.0, darwin arm64, 15 rounds:

| Fixture | Median | p95 |
| --- | ---: | ---: |
| Sync open/update/ack exchange | 14.65 us | 23.90 us |
| Sync message encode/decode | 3.60 us | 7.01 us |
| Model queue duplicate/drop | 1.47 us | 2.79 us |
| Replay artifact append/checkpoint | 10.83 us | 12.85 us |
| Memory storage update append | 4.33 us | 10.46 us |

These are Frontier-only package measurements, not competitor comparisons.

## License

MIT. See [LICENSE](./LICENSE).
