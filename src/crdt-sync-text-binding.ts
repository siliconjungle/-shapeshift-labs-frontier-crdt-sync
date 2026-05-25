import { getPath, parsePointer } from '@shapeshift-labs/frontier/pointer';
import type {
  CrdtCommitResult,
  CrdtDocHandle,
  CrdtTextBinding,
  CrdtTextBindingAdapter,
  CrdtTextBindingChange,
  CrdtTextBindingOptions,
  JsonPath,
  WatchPath
} from './types.js';

export function createCrdtTextBinding(
  handle: CrdtDocHandle,
  path: WatchPath,
  adapter: CrdtTextBindingAdapter,
  options?: CrdtTextBindingOptions
): CrdtTextBinding {
  return new FrontierCrdtTextBinding(handle, normalizeBindingPath(path), adapter, options);
}

class FrontierCrdtTextBinding implements CrdtTextBinding {
  readonly handle: CrdtDocHandle;
  readonly path: JsonPath;
  readonly adapter: CrdtTextBindingAdapter;
  private readonly initialSync: CrdtTextBindingOptions['initialSync'];
  private unsubscribeHandle: (() => void) | undefined;
  private unsubscribeAdapter: (() => void) | undefined;
  private applying = false;

  constructor(
    handle: CrdtDocHandle,
    path: JsonPath,
    adapter: CrdtTextBindingAdapter,
    options?: CrdtTextBindingOptions
  ) {
    this.handle = handle;
    this.path = path;
    this.adapter = adapter;
    this.initialSync = options?.initialSync ?? 'doc-to-editor';
  }

  isStarted(): boolean {
    return this.unsubscribeHandle !== undefined;
  }

  async start(): Promise<void> {
    if (this.isStarted()) return;
    if (this.initialSync === 'doc-to-editor') {
      this.syncFromDocument();
    } else if (this.initialSync === 'editor-to-doc') {
      await this.syncToDocument();
    }
    this.unsubscribeHandle = this.handle.subscribe(() => {
      if (!this.applying) this.syncFromDocument();
    });
    this.unsubscribeAdapter = this.adapter.onChange((change) => {
      if (!this.applying) void this.applyLocalChange(change);
    });
  }

  stop(): void {
    if (this.unsubscribeHandle !== undefined) {
      this.unsubscribeHandle();
      this.unsubscribeHandle = undefined;
    }
    if (this.unsubscribeAdapter !== undefined) {
      this.unsubscribeAdapter();
      this.unsubscribeAdapter = undefined;
    }
  }

  syncFromDocument(): void {
    const documentText = this.getDocumentText();
    const editorText = this.adapter.getText();
    if (documentText === editorText) return;
    this.applying = true;
    try {
      this.adapter.replaceText(0, codePointLength(editorText), documentText);
    } finally {
      this.applying = false;
    }
  }

  async syncToDocument(): Promise<CrdtCommitResult | undefined> {
    const documentText = this.getDocumentText();
    const editorText = this.adapter.getText();
    if (documentText === editorText) return undefined;
    this.applying = true;
    try {
      return await this.handle.recordLocalUpdate(
        this.handle.doc.text(this.path).splice(0, codePointLength(documentText), editorText)
      );
    } finally {
      this.applying = false;
    }
  }

  async applyLocalChange(change: CrdtTextBindingChange): Promise<CrdtCommitResult | undefined> {
    const splice = normalizeTextBindingChange(change, this.getDocumentText());
    if (splice === null) return undefined;
    this.applying = true;
    try {
      return await this.handle.recordLocalUpdate(
        this.handle.doc.text(this.path).splice(splice.index, splice.deleteCount, splice.insert)
      );
    } finally {
      this.applying = false;
    }
  }

  private getDocumentText(): string {
    const value = getPath(this.handle.doc.toJSON(), this.path);
    return typeof value === 'string' ? value : '';
  }
}

function normalizeBindingPath(path: WatchPath): JsonPath {
  return typeof path === 'string' ? parsePointer(path) : path.slice();
}

function normalizeTextBindingChange(
  change: CrdtTextBindingChange,
  documentText: string
): { index: number; deleteCount: number; insert: string } | null {
  if (typeof change.text === 'string') {
    if (change.text === documentText) return null;
    return {
      index: 0,
      deleteCount: codePointLength(documentText),
      insert: change.text
    };
  }
  const index = change.index ?? 0;
  const deleteCount = change.deleteCount ?? 0;
  const insert = change.insert ?? '';
  if (!Number.isSafeInteger(index) || index < 0) throw new TypeError('CRDT text binding index must be a non-negative integer');
  if (!Number.isSafeInteger(deleteCount) || deleteCount < 0) throw new TypeError('CRDT text binding deleteCount must be a non-negative integer');
  if (typeof insert !== 'string') throw new TypeError('CRDT text binding insert must be a string');
  if (deleteCount === 0 && insert.length === 0) return null;
  return { index, deleteCount, insert };
}

function codePointLength(text: string): number {
  let length = 0;
  for (const _char of text) length++;
  return length;
}
