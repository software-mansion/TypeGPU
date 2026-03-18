import Editor, { type BeforeMount, type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor } from 'tsover-monaco-editor';
import { entries, filter, fromEntries, isTruthy, map, pipe } from 'remeda';
import { SANDBOX_MODULES } from '../utils/examples/sandboxModules.ts';
import type { ExampleCommonFile, ExampleSrcFile } from '../utils/examples/types.ts';
import {
  tsnotoverCompilerOptions,
  tsoverCompilerOptions,
} from '../utils/liveEditor/embeddedTypeScript.ts';

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
  file: ExampleSrcFile | ExampleCommonFile;
  shown: boolean;
};

const createCodeEditorComponent =
  (
    language: 'typescript' | 'html',
    tsoverEnabled: boolean,
    beforeMount?: (tsover: boolean) => BeforeMount,
    onMount?: OnMount,
  ) =>
  (props: Props) => {
    const { file, shown } = props;

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
          beforeMount={beforeMount?.(tsoverEnabled)}
          onMount={onMount}
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

export const TsnotoverCodeEditor = createCodeEditorComponent(
  'typescript',
  false,
  handleEditorWillMount,
  handleEditorOnMount as OnMount,
);

export const TsoverCodeEditor = createCodeEditorComponent(
  'typescript',
  true,
  handleEditorWillMount,
  handleEditorOnMount as OnMount,
);

export const HtmlCodeEditor = createCodeEditorComponent('html', false);
