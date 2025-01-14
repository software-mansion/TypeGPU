import Editor, {
  type BeforeMount,
  type Monaco,
  type OnMount,
} from '@monaco-editor/react';
import webgpuTypes from '@webgpu/types/dist/index.d.ts?raw';
// biome-ignore lint/correctness/noUnusedImports: <its a namespace, Biome>
import type { editor } from 'monaco-editor';
import { entries, map, pipe } from 'remeda';
import typedBinary from 'typed-binary/dist/index.d.ts?raw';
import { tsCompilerOptions } from '../utils/liveEditor/embeddedTypeScript';

const typegpuDtsFiles: Record<string, string> = import.meta.glob(
  '../../../../packages/typegpu/dist/**/*.d.ts',
  {
    query: 'raw',
    eager: true,
    import: 'default',
  },
);

const typegpuExtraLibs = pipe(
  entries(typegpuDtsFiles),
  map(([path, content]) => ({
    filename: path.replace('../../../../packages/typegpu/dist', 'typegpu/dist'),
    content,
  })),
);

const mediacaptureDtsFiles: Record<string, string> = import.meta.glob(
  '../../node_modules/@types/dom-mediacapture-transform/**/*.d.ts',
  {
    query: 'raw',
    eager: true,
    import: 'default',
  },
);

const mediacaptureExtraLibs = pipe(
  entries(mediacaptureDtsFiles),
  map(([path, content]) => ({
    filename: path.replace(
      '../../node_modules/@types/dom-mediacapture-transform',
      '@types/dom-mediacapture-transform',
    ),
    content,
  })),
);

function handleEditorWillMount(monaco: Monaco) {
  const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

  tsDefaults.addExtraLib(webgpuTypes);
  for (const lib of typegpuExtraLibs) {
    tsDefaults.addExtraLib(lib.content, lib.filename);
  }
  for (const lib of mediacaptureExtraLibs) {
    tsDefaults.addExtraLib(lib.content, lib.filename);
  }
  tsDefaults.addExtraLib(typedBinary, 'typed-binary.d.ts');

  tsDefaults.setCompilerOptions({
    ...tsCompilerOptions,
    paths: {
      typegpu: ['typegpu/dist/index.d.ts'],
      'typegpu/data': ['typegpu/dist/data/index.d.ts'],
    },
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
