import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor } from 'tsover-monaco-editor';
import { entries, filter, fromEntries, isTruthy, map, pipe } from 'remeda';
import { SANDBOX_MODULES } from '../utils/examples/sandboxModules.ts';
import type { ExampleCommonFile, ExampleSrcFile } from '../utils/examples/types.ts';
import {
  tsnotoverCompilerOptions,
  tsoverCompilerOptions,
} from '../utils/liveEditor/embeddedTypeScript.ts';

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

const handleEditorWillMount = (tsover: boolean) => (monaco: Monaco) => {
  const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

  const reroutes = pipe(
    entries(SANDBOX_MODULES),
    map(([key, moduleDef]) => {
      if ('reroute' in moduleDef.typeDef) {
        return [key, [moduleDef.typeDef.reroute]] as [string, string[]];
      }
      return null;
    }),
    filter(isTruthy),
    fromEntries(),
  );

  for (const [moduleKey, moduleDef] of entries(SANDBOX_MODULES)) {
    if ('content' in moduleDef.typeDef) {
      tsDefaults.addExtraLib(moduleDef.typeDef.content, moduleDef.typeDef.filename);

      if (
        moduleDef.typeDef.filename &&
        moduleDef.typeDef.filename !== moduleKey // the redirect is not a no-op
      ) {
        reroutes[moduleKey] = [...(reroutes[moduleKey] ?? []), moduleDef.typeDef.filename];
      }
    }
  }

  tsDefaults.setCompilerOptions({
    ...(tsover ? tsoverCompilerOptions : tsnotoverCompilerOptions),
    paths: reroutes,
  });
};

function handleEditorOnMount(editor: editor.IStandaloneCodeEditor) {
  // Folding regions in code automatically. Useful for code not strictly
  // related to TypeGPU, like UI code.
  editor.trigger(null, 'editor.foldAllMarkerRegions', {});
}

type Props = {
  language: 'typescript' | 'html',
  tsoverEnabled: boolean,
  file: ExampleSrcFile | ExampleCommonFile;
  shown: boolean;
};

export function CodeEditor(props: Props) {
  const { language, tsoverEnabled, file, shown } = props;

  // Monaco needs relative paths to work correctly and '../../common/file.ts' will not do
  const path =
    'common' in file
      ? `common/${file.path}`
      : `${file.exampleKey.replace('--', '/')}/${file.path}`;

  return (
    <div className={shown ? 'h-[calc(100%-7rem)] md:h-[calc(100%-3rem)]' : 'hidden'}>
      <Editor
        defaultLanguage={language}
        value={tsoverEnabled ? file.content : (file.tsnotoverContent ?? file.content)}
        path={path}
        beforeMount={language === 'typescript' ? handleEditorWillMount(tsoverEnabled) : undefined}
        onMount={language === 'typescript' ? handleEditorOnMount as OnMount : undefined}
        options={{
          minimap: {
            enabled: false,
          },
          readOnly: true,
          domReadOnly: true,
        }}
      />
    </div>
  );
};
