# Frontier CRDT Sync

Sync protocol, repo, storage, provider, and binding contracts for Frontier CRDT documents.

This package sits above [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt). It keeps transport, persistence, document handles, local sync networks, model-checking helpers, and editor-facing sync bindings out of the core CRDT document package.

- npm: [`@shapeshift-labs/frontier-crdt-sync`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-sync)
- source: [`siliconjungle/-shapeshift-labs-frontier-crdt-sync`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync)
- license: MIT

## Related Packages

The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:

- [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier): Core JSON diff/apply, compact patch tuples, JSON Pointer, equality, clone, validation, Unicode helpers, and tiny dependency-free runtime budget/scheduler primitives.
- [`@shapeshift-labs/frontier-query`](https://www.npmjs.com/package/@shapeshift-labs/frontier-query): Shared query-key, selector path, condition, entity identity, and table-shape primitives.
- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec): Patch serialization, binary frames, canonical JSON, and patch-history codecs.
- [`@shapeshift-labs/frontier-engine`](https://www.npmjs.com/package/@shapeshift-labs/frontier-engine): Stateful planned diff engine, adaptive profiles, schema plans, and engine-level history helpers.
- [`@shapeshift-labs/frontier-state`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state): Patch-routed app-state subscriptions, owned commits, maintained views, and path mapping.
- [`@shapeshift-labs/frontier-dataflow`](https://www.npmjs.com/package/@shapeshift-labs/frontier-dataflow): Serializable incremental dataflow and materialized-view graphs for Frontier apps, including selectors, dependency DAGs, filters, joins, aggregations, stale paths, recompute budgets, output patches, provenance records, and proof of why derived views changed.
- [`@shapeshift-labs/frontier-state-cache`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache): Normalized query-result cache with entity/query watchers, persistence, change logs, optimistic layers, scheduled persistence, and mutation bridge.
- [`@shapeshift-labs/frontier-state-cache-idb`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-idb): IndexedDB persistence adapter for Frontier state-cache snapshots and durable change logs.
- [`@shapeshift-labs/frontier-state-cache-file`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-file): Structured file persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-state-cache-sql`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-sql): SQL persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-schema`](https://www.npmjs.com/package/@shapeshift-labs/frontier-schema): JSON Schema validation, Frontier profile generation, CloudEvent envelopes, and query/table schema helpers.
- [`@shapeshift-labs/frontier-migrations`](https://www.npmjs.com/package/@shapeshift-labs/frontier-migrations): Boundary-first data migrations, import normalization, plugin/API version mapping, versioned envelopes, graph diagnostics, patch path rewrites, dry-run reports, and current-shape rehydration.
- [`@shapeshift-labs/frontier-event-log`](https://www.npmjs.com/package/@shapeshift-labs/frontier-event-log): Bounded event logs, replay cursors, consumer acknowledgements, keyed compaction, checkpoints, and Frontier patch event records.
- [`@shapeshift-labs/frontier-inspect`](https://www.npmjs.com/package/@shapeshift-labs/frontier-inspect): Cross-package inspection/evidence bundles, registry graph snapshots, feature/resource impact reports, timeline/event normalization, redaction, JSONL import/export, and AI-readable app feature maps.
- [`@shapeshift-labs/frontier-scheduler`](https://www.npmjs.com/package/@shapeshift-labs/frontier-scheduler): Deterministic work scheduling, lanes, cancellation, backpressure, frame policies, replay snapshots, and work graphs.
- [`@shapeshift-labs/frontier-logging`](https://www.npmjs.com/package/@shapeshift-labs/frontier-logging): Opt-in structured logging, browser telemetry, scheduled sinks, file sinks, exporters, benchmark traces, and Frontier patch/update summaries.
- [`@shapeshift-labs/frontier-mutation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation): Explicit mutation and selector plans compiled to Frontier patches or CRDT operations.
- [`@shapeshift-labs/frontier-effects`](https://www.npmjs.com/package/@shapeshift-labs/frontier-effects): Serializable effect descriptors and resource graphs for Frontier apps, including fetch, storage, timers, navigation, workers, clipboard, broadcast, WebSocket, stream, policy metadata, runtime records, redaction, JSONL, proof helpers, and registry graph output.
- [`@shapeshift-labs/frontier-policy`](https://www.npmjs.com/package/@shapeshift-labs/frontier-policy): Serializable policy and capability decisions for Frontier apps, effects, views, sync, routes, traces, and AI tools.
- [`@shapeshift-labs/frontier-tools`](https://www.npmjs.com/package/@shapeshift-labs/frontier-tools): Serializable app action/tool manifests for AI-operable Frontier apps, including availability, validation, dry-run plans, patch previews, effect/tool constraints, execution records, rollback links, and registry graph output.
- [`@shapeshift-labs/frontier-workflow`](https://www.npmjs.com/package/@shapeshift-labs/frontier-workflow): Serializable durable workflow/process manifests for Frontier apps, including steps, waits, approvals, timers, retries, expected patches, compensation, records, timelines, and registry graph output.
- [`@shapeshift-labs/frontier-worker`](https://www.npmjs.com/package/@shapeshift-labs/frontier-worker): Serializable worker and edge task descriptors for Frontier apps, including queues, idempotency keys, retry and timeout policy, declared reads/writes/effects, snapshots, patch outputs, produced assets, execution records, logs, trace links, proof hashes, dedupe indexes, and registry graph output.
- [`@shapeshift-labs/frontier-assets`](https://www.npmjs.com/package/@shapeshift-labs/frontier-assets): Serializable asset and content provenance graphs for Frontier apps, including source files, generated variants, thumbnails, LOD chunks, shader/material dependencies, transforms, hashes, owners, runtime consumers, review plans, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-triggers`](https://www.npmjs.com/package/@shapeshift-labs/frontier-triggers): Capability-gated event trigger registry, scoped event envelopes, listener/reaction rules, structured rejection, deterministic event-to-action scheduling, replay/provenance records, and registry graph output.
- [`@shapeshift-labs/frontier-virtual`](https://www.npmjs.com/package/@shapeshift-labs/frontier-virtual): DOM-neutral virtualization, layout providers, range materialization, grids, spatial/frustum indexes, patch invalidation, camera anchors, and serializable layout state.
- [`@shapeshift-labs/frontier-scene`](https://www.npmjs.com/package/@shapeshift-labs/frontier-scene): Patch-native 2D/3D scene graph, transform propagation, bounds queries, virtual/culling adapters, spatial invalidation, and camera/frustum materialization.
- [`@shapeshift-labs/frontier-pathfinding`](https://www.npmjs.com/package/@shapeshift-labs/frontier-pathfinding): Patch-native grid pathfinding, typed-array A*/Dijkstra search, flow fields, connected components, line-of-sight smoothing, dirty-cell invalidation, and scheduler-friendly path jobs.
- [`@shapeshift-labs/frontier-lod`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lod): Patch-native level-of-detail and significance selection for rendering and computation workloads, compact typed hot paths, multi-observer selection, budget degradation, materialization frames, and scheduler work plans.
- [`@shapeshift-labs/frontier-route`](https://www.npmjs.com/package/@shapeshift-labs/frontier-route): DOM-neutral app/game route resources, route and scene manifests, match/resolve/transition planning, dependency metadata, sessions, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-trace`](https://www.npmjs.com/package/@shapeshift-labs/frontier-trace): Serializable traces, spans, events, causal links, W3C trace context helpers, timeline/resource/path queries, critical-path analysis, registry graph output, JSONL/proof helpers, Chrome trace export, and redaction for app-wide feature observability.
- [`@shapeshift-labs/frontier-manifest`](https://www.npmjs.com/package/@shapeshift-labs/frontier-manifest): Build/static feature manifests for owners, routes, actions, states, migrations, tests, source files, assets, resources, tasks, dependency metadata, registry graph output, feature maps, JSONL export, and impact queries.
- [`@shapeshift-labs/frontier-view`](https://www.npmjs.com/package/@shapeshift-labs/frontier-view): Renderer-neutral view manifests, type defaults, validation frames, action bindings, visual channels, virtual/LOD hints, and data-to-representation mapping for Frontier apps.
- [`@shapeshift-labs/frontier-dom`](https://www.npmjs.com/package/@shapeshift-labs/frontier-dom): Patch-native DOM and host renderer bindings, manifest hydration, JSX runtime/compiler helpers, SSR, devtools, and logging bridges.
- [`@shapeshift-labs/frontier-playwright`](https://www.npmjs.com/package/@shapeshift-labs/frontier-playwright): Playwright/headless automation probes for Frontier state, DOM, devtools, marks, and timeline queries.
- [`@shapeshift-labs/frontier-test`](https://www.npmjs.com/package/@shapeshift-labs/frontier-test): Serializable test/spec evidence manifests for Frontier apps, including fixtures, commands, expected patches/effects/routes/policies, coverage declarations, run plans, run records, report adapters, replay proofs, fuzzers, benchmarks, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-history`](https://www.npmjs.com/package/@shapeshift-labs/frontier-history): Serializable temporal explanation and causality records for Frontier apps, including field-change explanations, action/workflow/policy/effect/trace/test provenance, audit windows, undo planning, registry/provenance graph output, JSONL replay bundles, and proof hashes.
- [`@shapeshift-labs/frontier-application`](https://www.npmjs.com/package/@shapeshift-labs/frontier-application): Serializable whole-application graph and impact queries for Frontier apps, including features, owners, packages, routes, views, actions, mutations, state paths, effects, workers, assets, tests, traces, policies, workflows, migrations, benchmarks, registry graph output, feature maps, JSONL bundles, and proof hashes.
- [`@shapeshift-labs/frontier-linter`](https://www.npmjs.com/package/@shapeshift-labs/frontier-linter): Serializable Frontier lint rules, diagnostics, fixes, reports, and fast rule execution for package catalogs, registry graphs, application maps, manifests, traces, policies, workflows, workers, assets, tests, benchmarks, and source snippets.
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
- [`siliconjungle/-shapeshift-labs-frontier-dataflow`](https://github.com/siliconjungle/-shapeshift-labs-frontier-dataflow)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-idb`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-idb)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-file`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-file)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-sql`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-sql)
- [`siliconjungle/-shapeshift-labs-frontier-schema`](https://github.com/siliconjungle/-shapeshift-labs-frontier-schema)
- [`siliconjungle/-shapeshift-labs-frontier-migrations`](https://github.com/siliconjungle/-shapeshift-labs-frontier-migrations)
- [`siliconjungle/-shapeshift-labs-frontier-event-log`](https://github.com/siliconjungle/-shapeshift-labs-frontier-event-log)
- [`siliconjungle/-shapeshift-labs-frontier-inspect`](https://github.com/siliconjungle/-shapeshift-labs-frontier-inspect)
- [`siliconjungle/-shapeshift-labs-frontier-scheduler`](https://github.com/siliconjungle/-shapeshift-labs-frontier-scheduler)
- [`siliconjungle/-shapeshift-labs-frontier-logging`](https://github.com/siliconjungle/-shapeshift-labs-frontier-logging)
- [`siliconjungle/-shapeshift-labs-frontier-mutation`](https://github.com/siliconjungle/-shapeshift-labs-frontier-mutation)
- [`siliconjungle/-shapeshift-labs-frontier-effects`](https://github.com/siliconjungle/-shapeshift-labs-frontier-effects)
- [`siliconjungle/-shapeshift-labs-frontier-policy`](https://github.com/siliconjungle/-shapeshift-labs-frontier-policy)
- [`siliconjungle/-shapeshift-labs-frontier-tools`](https://github.com/siliconjungle/-shapeshift-labs-frontier-tools)
- [`siliconjungle/-shapeshift-labs-frontier-workflow`](https://github.com/siliconjungle/-shapeshift-labs-frontier-workflow)
- [`siliconjungle/-shapeshift-labs-frontier-worker`](https://github.com/siliconjungle/-shapeshift-labs-frontier-worker)
- [`siliconjungle/-shapeshift-labs-frontier-assets`](https://github.com/siliconjungle/-shapeshift-labs-frontier-assets)
- [`siliconjungle/-shapeshift-labs-frontier-triggers`](https://github.com/siliconjungle/-shapeshift-labs-frontier-triggers)
- [`siliconjungle/-shapeshift-labs-frontier-virtual`](https://github.com/siliconjungle/-shapeshift-labs-frontier-virtual)
- [`siliconjungle/-shapeshift-labs-frontier-scene`](https://github.com/siliconjungle/-shapeshift-labs-frontier-scene)
- [`siliconjungle/-shapeshift-labs-frontier-pathfinding`](https://github.com/siliconjungle/-shapeshift-labs-frontier-pathfinding)
- [`siliconjungle/-shapeshift-labs-frontier-lod`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lod)
- [`siliconjungle/-shapeshift-labs-frontier-route`](https://github.com/siliconjungle/-shapeshift-labs-frontier-route)
- [`siliconjungle/-shapeshift-labs-frontier-trace`](https://github.com/siliconjungle/-shapeshift-labs-frontier-trace)
- [`siliconjungle/-shapeshift-labs-frontier-manifest`](https://github.com/siliconjungle/-shapeshift-labs-frontier-manifest)
- [`siliconjungle/-shapeshift-labs-frontier-view`](https://github.com/siliconjungle/-shapeshift-labs-frontier-view)
- [`siliconjungle/-shapeshift-labs-frontier-dom`](https://github.com/siliconjungle/-shapeshift-labs-frontier-dom)
- [`siliconjungle/-shapeshift-labs-frontier-playwright`](https://github.com/siliconjungle/-shapeshift-labs-frontier-playwright)
- [`siliconjungle/-shapeshift-labs-frontier-test`](https://github.com/siliconjungle/-shapeshift-labs-frontier-test)
- [`siliconjungle/-shapeshift-labs-frontier-history`](https://github.com/siliconjungle/-shapeshift-labs-frontier-history)
- [`siliconjungle/-shapeshift-labs-frontier-application`](https://github.com/siliconjungle/-shapeshift-labs-frontier-application)
- [`siliconjungle/-shapeshift-labs-frontier-linter`](https://github.com/siliconjungle/-shapeshift-labs-frontier-linter)
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
  createCrdtSyncGhostState,
  createCrdtSyncProvider,
  scheduleCrdtSync,
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
  diffCrdtSyncActorRanges,
  unionCrdtSyncActorRanges,
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
import { createCrdtSyncProvider, scheduleCrdtSync } from '@shapeshift-labs/frontier-crdt-sync/provider';
import {
  createCrdtSyncModelChecker,
  replayCrdtSyncModelReproScenario,
  minimizeCrdtSyncModelReproScenario,
  createCrdtSyncModelReproArtifact,
  replayCrdtSyncModelSchedule,
  minimizeCrdtSyncModelSchedule
} from '@shapeshift-labs/frontier-crdt-sync/model';
import { createCrdtSyncLazyBodyStore } from '@shapeshift-labs/frontier-crdt-sync/lazy-body';
import { createCrdtSyncReplayArtifactStore } from '@shapeshift-labs/frontier-crdt-sync/forensics';
import { createCrdtTextBinding } from '@shapeshift-labs/frontier-crdt-sync/text-binding';
```

Each subpath has its own narrow package entry and export surface. The implementation still shares the same sync runtime internally while the module boundaries settle.

`scheduleCrdtSync(provider, { scheduler, peerId? })` queues provider sync through any structural scheduler. It lets apps route CRDT traffic through the same deterministic lanes/backpressure policy used by DOM, virtual, scene, mutation, cache, and logging without making this package import `frontier-scheduler`.

## Lazy Update Bodies

Large CRDT updates can be advertised as metadata first, then fetched from a body store by hash. `createCrdtSyncLazyUpdateMessage()` stores the update bytes and replaces them with an `updateBody` reference containing the body hash, byte length, state vector, and actor ranges. Receivers call `hydrateCrdtSyncLazyUpdateMessage()` before applying the update.

```ts
import {
  createCrdtSyncLazyBodyStore,
  createCrdtSyncLazyUpdateMessage,
  hydrateCrdtSyncLazyUpdateMessage
} from '@shapeshift-labs/frontier-crdt-sync/lazy-body';

const bodies = createCrdtSyncLazyBodyStore();
const advertised = createCrdtSyncLazyUpdateMessage(updateMessage, bodies, {
  thresholdBytes: 4096
});

const readyToApply = hydrateCrdtSyncLazyUpdateMessage(advertised, bodies);
```

`createCrdtSyncProvider()` accepts the same store via `lazyBodies` and performs the advertise/hydrate step around its transport sends and receives. The body store is intentionally local and transport-agnostic; a real client/server transport can back it with HTTP, object storage, or an existing content cache.

## Per-Client Ghost State

`createCrdtSyncGhostState()` is a small per-client replication helper for game-networking-style delta repair. It tracks three actor-range sets:

- acknowledged ranges the client has confirmed,
- ghost ranges the server predicts the client has because deltas were sent,
- pending ranges that were sent but not acknowledged.

Normal frame sends call `createDelta(doc)`, which advances the ghost range and returns only ranges not already predicted for that client. After packet loss or reconnect, call `createRepairDelta(doc)` to encode one unioned delta from the last acknowledged ranges to the current document instead of replaying every missed frame delta.

```ts
import { createCrdtSyncGhostState } from '@shapeshift-labs/frontier-crdt-sync/sync';

const ghost = createCrdtSyncGhostState();
const delta = ghost.createDelta(serverDoc);

if (delta) {
  transport.send(delta.update);
}

const repair = ghost.createRepairDelta(serverDoc);

if (repair) {
  transport.send(repair.update);
  ghost.markAcked(repair.ranges);
}
```

The delta result includes `basisRanges`, `ranges`, and `targetRanges` so a receiver or transport adapter can discard packets whose basis is not legal for its current materialized state. This helper does not add prediction, interpolation, ownership, or transport semantics; those belong above the CRDT sync layer.

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

## Replay Artifacts

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
- optional `documentId`, `senderId`, `actorRanges`, `reconciliation`, base64 update bytes, and `updateBody`

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

- Without `actorRangeSync`, peers use only the state vector. This is the normal path for peers with contiguous actor coverage.
- `actorRangeSync: true` keeps the state vector as the baseline and adds sparse summaries only when the local document has non-contiguous actor coverage.
- Small sparse summaries send exact `actorRanges` and let the receiver encode only the missing actor ranges.
- Large sparse summaries send `reconciliation`, a bounded Merkle/IBLT-style sketch with `strategy: "merkle-iblt"`, `bucketSize`, `rangeCount`, `opCount`, and per-actor cells containing `start`, `end`, `count`, and `hash`.
- A receiver compares local bucket counts/hashes with the remote sketch and repairs only differing buckets plus suffixes beyond the sketch.
- `updateBody` advertises a large update by metadata only: `{ version: 1, kind: "crdt-update", hash, byteLength, stateVector, actorRanges }`. The receiver must fetch or hydrate the referenced body before passing the message to the endpoint.
- Peers without a lazy body store keep sending inline `update` bytes.
- Peers that do not send `actorRanges` or `reconciliation` fall back to state-vector behavior.
- Older peers that ignore unknown `reconciliation` fields remain state-vector compatible, but they do not get the large-divergence sparse repair tier.
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
- Metadata-only lazy update body references and the in-memory body store used by transport adapters.
- Per-client ghost state helpers for unioned CRDT actor-range repair deltas.
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

`npm test` includes smoke coverage, protocol/storage hardening, storage-compaction schedules, provider/repo restart scenarios, rollback convergence fixtures, a deterministic model-checking soak, and the standard fuzzer. `npm run fuzz` raises the randomized sync and soak coverage. `npm run soak` runs a longer deterministic network schedule pass with packet loss, reordering, duplication, reconnects, peer churn, storage restores, and partial compaction paths.

## Benchmarks

Run the package-local benchmark:

```sh
npm run bench
```

Latest local package benchmark on Node v26.1.0, darwin arm64, 9 rounds:

| Fixture | Median | p95 |
| --- | ---: | ---: |
| Sync open/update/ack exchange | 11.24 us | 17.97 us |
| Tiered sparse sync exchange | 3.11 ms | 3.37 ms |
| Lost-frame replay delta encode (5,330 B) | 398.74 us | 407.68 us |
| Ghost union repair delta encode (2,411 B) | 132.56 us | 148.07 us |
| Eager large update encode/decode (25,647 B) | 217.47 us | 220.07 us |
| Lazy large update advertise/fetch (352 B advert) | 45.32 us | 46.59 us |
| Sync message encode/decode | 3.33 us | 7.09 us |
| Model queue duplicate/drop | 1.92 us | 3.74 us |
| Replay artifact append/checkpoint | 8.82 us | 9.29 us |
| Memory storage update append | 4.09 us | 8.26 us |

These are Frontier-only package measurements, not competitor comparisons.

The tiered sparse exchange now uses a bucket repair encoder for multi-range repairs. In the 512-op anti-entropy benchmark, the large-divergence state-vector path sent 12,528 bytes in 203.88 us median; the tiered sketch path sent 4,016 bytes in 402.62 us median by slicing one CRDT history window into the differing buckets. The tiered path is still a CPU tradeoff on this fixture, but the repair encoder removes the previous 32 export/merge pass that measured 3,725.46 us median.

The ghost repair fixture models a client that acknowledged the first four frames, missed twelve frame deltas, then reconnects. Replaying the missed frame deltas encoded 5,330 bytes in 433.59 us median; one unioned ghost repair delta encoded 2,411 bytes in 140.63 us median.

The lazy body fixture models a 25,647 byte encoded CRDT update. The eager path encoded and decoded the full message in 217.47 us median. The lazy path advertised a 352 byte metadata envelope, fetched the body from the lazy store by hash, and hydrated it in 45.32 us median.

## License

MIT. See [LICENSE](./LICENSE).
