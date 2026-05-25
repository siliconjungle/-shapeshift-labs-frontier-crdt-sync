# Frontier CRDT Sync

Reserved package name for the future Frontier CRDT sync, repo, provider, and storage layer.

This package is not ready for production use. It exists so the package and repository names are reserved while the CRDT sync protocol, storage, provider, repo, and editor-binding boundaries are finalized.

- npm: [`@shapeshift-labs/frontier-crdt-sync`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-sync)
- source: [`siliconjungle/-shapeshift-labs-frontier-crdt-sync`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync)
- CRDT package: [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt)
- core package: [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier)
- license: MIT

## Intended Scope

When this package graduates from placeholder status, it is expected to contain:

- sync states, endpoint messages, and encoded sync message envelopes;
- transport-agnostic providers;
- document handles, repos, document URLs, and memory storage;
- storage compaction helpers;
- local sync networks, model-checking helpers, and convergence checks;
- plain text binding contracts.

It should depend on `@shapeshift-labs/frontier-crdt`. It should stay separate from the CRDT document model itself, the small JSON diff/apply core, logging, schema validation, and app-state subscriptions.

## Current Status

Use [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier) for the stable JSON diff/apply core and [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec) for patch transport codecs.

The CRDT sync package is reserved only. No runtime API is exported yet.

## Package Family

Published or active packages:

- [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier)
- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec)
- [`@shapeshift-labs/frontier-mutation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation)

Reserved future packages:

- `@shapeshift-labs/frontier-engine`
- `@shapeshift-labs/frontier-state`
- `@shapeshift-labs/frontier-crdt`
- `@shapeshift-labs/frontier-richtext`
- `@shapeshift-labs/frontier-logging`
- `@shapeshift-labs/frontier-state-cache`
- `@shapeshift-labs/frontier-event-log`
- `@shapeshift-labs/frontier-schema`

## License

MIT. See [LICENSE](./LICENSE).
