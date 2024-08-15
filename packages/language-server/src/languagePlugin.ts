import type {
  CodeMapping,
  LanguagePlugin,
  Mapping,
  VirtualCode,
} from '@volar/language-core';
import type * as ts from 'typescript';
import type { URI } from 'vscode-uri';

export const language = {
  getLanguageId(uri) {
    if (uri.path.endsWith('.tgpu')) {
      return 'tgpu';
    }
  },

  createVirtualCode(uri, languageId, snapshot) {
    if (languageId === 'typegpu') {
      return new TypeGpuCode(snapshot);
    }
  },

  updateVirtualCode(uri, languageCode, snapshot) {
    languageCode.update(snapshot);
    return languageCode;
  },
} satisfies LanguagePlugin<URI, TypeGpuCode>;

export class TypeGpuCode implements VirtualCode {
  id = 'root';
  languageId = 'typegpu';
  mappings: CodeMapping[] = [];
  embeddedCodes: VirtualCode[] = [];

  constructor(public snapshot: ts.IScriptSnapshot) {
    this.onSnapshotUpdated();
  }

  associatedScriptMappings?: Map<unknown, CodeMapping[]>;
  linkedCodeMappings?: Mapping<unknown>[];

  public update(newSnapshot: ts.IScriptSnapshot) {
    this.snapshot = newSnapshot;
    this.onSnapshotUpdated();
  }

  public onSnapshotUpdated() {
    // TODO: Implement an incremental parser.
    const content = this.snapshot.getText(0, this.snapshot.getLength());
    console.log(`Snapshot: "${content}"`);
    // TODO: Do something with the snapshot
  }
}
