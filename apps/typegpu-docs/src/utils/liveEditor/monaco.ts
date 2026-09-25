// This setup is required for tsover to work, because monaco-react won't use custom monaco without `loader.config()`
// Config docs: https://www.npmjs.com/package/@monaco-editor/react?activeTab=readme#loader-config
// Integration docs: https://github.com/microsoft/monaco-editor/blob/main/docs/integrate-esm.md
import { loader } from '@monaco-editor/react';
import * as monaco from 'tsover-monaco-editor';
// oxlint-disable-next-line import/default
import editorWorker from 'tsover-monaco-editor/esm/vs/editor/editor.worker?worker';
// oxlint-disable-next-line import/default
import jsonWorker from 'tsover-monaco-editor/esm/vs/language/json/json.worker?worker';
// oxlint-disable-next-line import/default
import cssWorker from 'tsover-monaco-editor/esm/vs/language/css/css.worker?worker';
// oxlint-disable-next-line import/default
import htmlWorker from 'tsover-monaco-editor/esm/vs/language/html/html.worker?worker';
// oxlint-disable-next-line import/default
import tsWorker from 'tsover-monaco-editor/esm/vs/language/typescript/ts.worker?worker';

export function configureMonaco() {
  self.MonacoEnvironment = {
    getWorker(_, label) {
      switch (label) {
        case 'json':
          return new jsonWorker();
        case 'css':
          return new cssWorker();
        case 'html':
          return new htmlWorker();
        case 'typescript':
        case 'javascript':
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };

  loader.config({ monaco });
}
