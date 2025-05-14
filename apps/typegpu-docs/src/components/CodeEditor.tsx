import Editor, {
  type BeforeMount,
  type Monaco,
  type OnMount,
} from '@monaco-editor/react';
// biome-ignore lint/correctness/noUnusedImports: <its a namespace, Biome>
import type { editor } from 'monaco-editor';
import { entries, filter, fromEntries, isTruthy, map, pipe } from 'remeda';
import { SANDBOX_MODULES } from '../utils/examples/sandboxModules.ts';
import type { ExampleSrcFile } from '../utils/examples/types.ts';
import { tsCompilerOptions } from '../utils/liveEditor/embeddedTypeScript.ts';

function handleEditorWillMount(monaco: Monaco) {
  const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

  const reroutes = pipe(
    entries(SANDBOX_MODULES),
    map(([key, moduleDef]) => {
      if ('reroute' in moduleDef.typeDef) {
        return [key, moduleDef.typeDef.reroute] as const;
      }
      return null;
    }),
    filter(isTruthy),
    fromEntries(),
  );

  for (const [moduleKey, moduleDef] of entries(SANDBOX_MODULES)) {
    if ('content' in moduleDef.typeDef) {
      tsDefaults.addExtraLib(
        moduleDef.typeDef.content,
        moduleDef.typeDef.filename,
      );

      if (
        moduleDef.typeDef.filename &&
        moduleDef.typeDef.filename !== moduleKey // the redirect is not a no-op
      ) {
        reroutes[moduleKey] = [
          ...(reroutes[moduleKey] ?? []),
          moduleDef.typeDef.filename,
        ];
      }
    }
  }

  tsDefaults.setCompilerOptions({
    ...tsCompilerOptions,
    paths: reroutes,
  });
}

function handleEditorOnMount(editor: editor.IStandaloneCodeEditor) {
  // Folding regions in code automatically. Useful for code not strictly
  // related to TypeGPU, like UI code.
  editor.trigger(null, 'editor.foldAllMarkerRegions', {});
}

type Props = {
  file: ExampleSrcFile;
  shown: boolean;
};

const createCodeEditorComponent = (
  language: 'typescript' | 'html',
  beforeMount?: BeforeMount,
  onMount?: OnMount,
) =>
(props: Props) => {
  const { file, shown } = props;

  return (
    <div
      className={shown
        ? 'h-[calc(100%-7rem)] md:h-[calc(100%-3rem)]'
        : 'hidden'}
    >
      <Editor
        defaultLanguage={language}
        value={file.content}
        path={file.path}
        beforeMount={beforeMount}
        onMount={onMount}
        options={{
          minimap: {
            enabled: false,
          },
          readOnly: true,
        }}
      />
    </div>
  );
};

export const TsCodeEditor = createCodeEditorComponent(
  'typescript',
  handleEditorWillMount,
  handleEditorOnMount,
);

export const HtmlCodeEditor = createCodeEditorComponent('html');
