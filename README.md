# Frontier CRDT Sync

Sync protocol, repo, storage, provider, and binding contracts for Frontier CRDT documents.

This package sits above [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt). It keeps transport, persistence, document handles, local sync networks, model-checking helpers, and editor-facing sync bindings out of the core CRDT document package.

- npm: [`@shapeshift-labs/frontier-crdt-sync`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-sync)
- source: [`siliconjungle/-shapeshift-labs-frontier-crdt-sync`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync)
- license: MIT

## Related Packages

- [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt): native CRDT document and update layer.
- [`@shapeshift-labs/frontier-crdt-websocket`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-websocket): concrete WebSocket client/server transport for this package's providers.
- [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier): core JSON diff/apply primitives below the CRDT layer.
- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec): patch/history codec layer below CRDT update tooling.
- [`@shapeshift-labs/frontier-state`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state): app-state engine layer for routed views.

Package source repositories:

- [`siliconjungle/-shapeshift-labs-frontier`](https://github.com/siliconjungle/-shapeshift-labs-frontier)
- [`siliconjungle/-shapeshift-labs-frontier-crdt`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt)
- [`siliconjungle/-shapeshift-labs-frontier-crdt-sync`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync)
- [`siliconjungle/-shapeshift-labs-frontier-crdt-websocket`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-websocket)

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
  replayCrdtSyncModelSchedule,
  minimizeCrdtSyncModelSchedule,
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
  replayCrdtSyncModelSchedule,
  minimizeCrdtSyncModelSchedule
} from '@shapeshift-labs/frontier-crdt-sync/model';
import { createCrdtTextBinding } from '@shapeshift-labs/frontier-crdt-sync/text-binding';
```

Each subpath has its own narrow package entry and export surface. The implementation still shares the same sync runtime internally while the module boundaries settle.

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

Latest local package benchmark on Node v26.1.0, darwin arm64, 7 rounds:

| Fixture | Median | p95 |
| --- | ---: | ---: |
| Sync open/update/ack exchange | 11.19 us | 15.94 us |
| Sync message encode/decode | 3.76 us | 4.74 us |
| Model queue duplicate/drop | 1.28 us | 5.95 us |
| Memory storage update append | 2.60 us | 6.47 us |

These are Frontier-only package measurements, not competitor comparisons.

## License

MIT. See [LICENSE](./LICENSE).
