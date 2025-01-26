import Editor, {
  type BeforeMount,
  type Monaco,
  type OnMount,
} from '@monaco-editor/react';
// biome-ignore lint/correctness/noUnusedImports: <its a namespace, Biome>
import type { editor } from 'monaco-editor';
import {
  entries,
  filter,
  fromEntries,
  isTruthy,
  map,
  pipe,
  values,
} from 'remeda';
import { SANDBOX_MODULES } from '../utils/examples/sandboxModules';
import { tsCompilerOptions } from '../utils/liveEditor/embeddedTypeScript';

function handleEditorWillMount(monaco: Monaco) {
  const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

  for (const moduleDef of values(SANDBOX_MODULES)) {
    if ('content' in moduleDef.typeDef) {
      tsDefaults.addExtraLib(
        moduleDef.typeDef.content,
        moduleDef.typeDef.filename,
      );
    }
  }

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
  code: string;
  shown: boolean;
};

const createCodeEditorComponent =
  (
    language: 'typescript' | 'html',
    beforeMount?: BeforeMount,
    onMount?: OnMount,
  ) =>
  (props: Props) => {
    const { code, shown } = props;

    return (
      <div className={shown ? 'contents' : 'hidden'}>
        <Editor
          defaultLanguage={language}
          value={code}
          beforeMount={beforeMount}
          onMount={onMount}
          options={{
            minimap: {
              enabled: false,
            },
            readOnly: true,
          }}
          className="pt-16 md:pt-0"
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
