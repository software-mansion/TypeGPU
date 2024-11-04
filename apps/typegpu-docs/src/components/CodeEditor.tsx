import Editor, { type BeforeMount, type Monaco } from '@monaco-editor/react';
import typegpuJitDts from '@typegpu/jit/dist/index.d.ts?raw';
import webgpuTypes from '@webgpu/types/dist/index.d.ts?raw';
import { entries, map, pipe } from 'remeda';
import typedBinary from 'typed-binary/dist/index.d.ts?raw';
import toolkitTypes from '../types/example-toolkit.d.ts?raw';
import { tsCompilerOptions } from '../utils/liveEditor/embeddedTypeScript';
import useEvent from '../utils/useEvent';

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
  tsDefaults.addExtraLib(toolkitTypes, 'example-toolkit.d.ts');
  tsDefaults.addExtraLib(typedBinary, 'typed-binary.d.ts');
  tsDefaults.addExtraLib(typegpuJitDts, 'typegpu-jit.d.ts');

  tsDefaults.setCompilerOptions({
    ...tsCompilerOptions,
    paths: {
      typegpu: ['typegpu/dist/index.d.ts'],
      'typegpu/experimental': ['typegpu/dist/experimental/index.d.ts'],
      'typegpu/data': ['typegpu/dist/data/index.d.ts'],
      'typegpu/macro': ['typegpu/dist/macro/index.d.ts'],
      '@typegpu/jit': ['typegpu-jit.d.ts'],
    },
  });
}

type Props = {
  code: string;
  onCodeChange: (value: string) => unknown;
};

const createCodeEditorComponent =
  (language: 'typescript' | 'html', beforeMount?: BeforeMount) =>
  (props: Props) => {
    const { code, onCodeChange } = props;

    const handleChange = useEvent((value: string | undefined) => {
      onCodeChange(value ?? '');
    });

    return (
      <Editor
        defaultLanguage={language}
        value={code}
        onChange={handleChange}
        beforeMount={beforeMount}
        options={{
          minimap: {
            enabled: false,
          },
        }}
        className="pt-16 md:pt-0"
      />
    );
  };

export const TsCodeEditor = createCodeEditorComponent(
  'typescript',
  handleEditorWillMount,
);

export const HtmlCodeEditor = createCodeEditorComponent('html');
