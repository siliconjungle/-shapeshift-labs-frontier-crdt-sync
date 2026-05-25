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
import { createCrdtSyncModelChecker } from '@shapeshift-labs/frontier-crdt-sync/model';
import { createCrdtTextBinding } from '@shapeshift-labs/frontier-crdt-sync/text-binding';
```

Each subpath has its own narrow package entry and export surface. The implementation still shares the same sync runtime internally while the module boundaries settle.

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
npm run bench
npm run pack:dry
```

## Benchmarks

Run the package-local benchmark:

```sh
npm run bench
```

Latest local package benchmark on Node v26.1.0, darwin arm64, 5 rounds:

| Fixture | Median | p95 |
| --- | ---: | ---: |
| Sync open/update/ack exchange | 20.93 us | 28.87 us |
| Sync message encode/decode | 6.33 us | 10.51 us |
| Memory storage update append | 3.16 us | 9.95 us |

These are Frontier-only package measurements, not competitor comparisons.

## License

MIT. See [LICENSE](./LICENSE).
