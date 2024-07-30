import Editor, { type Monaco } from '@monaco-editor/react';
import webgpuTypes from '@webgpu/types/dist/index.d.ts?raw';
import { entries, map, pipe } from 'remeda';
import typedBinary from 'typed-binary/dist/index.d.ts?raw';
import useEvent from './common/useEvent';
import { tsCompilerOptions } from './embeddedTypeScript';
import toolkitTypes from './types/example-toolkit.d.ts?raw';

const wigsillDtsFiles: Record<string, string> = import.meta.glob(
  '../../../packages/wigsill/dist/**/*.d.ts',
  {
    query: 'raw',
    eager: true,
    import: 'default',
  },
);

const wigsillExtraLibs = pipe(
  entries(wigsillDtsFiles),
  map(([path, content]) => ({
    filename: path.replace('../../../packages/wigsill/dist', 'wigsill/dist'),
    content,
  })),
);

function handleEditorWillMount(monaco: Monaco) {
  const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

  tsDefaults.addExtraLib(webgpuTypes);
  for (const lib of wigsillExtraLibs) {
    tsDefaults.addExtraLib(lib.content, lib.filename);
  }
  tsDefaults.addExtraLib(toolkitTypes, 'example-toolkit.d.ts');
  tsDefaults.addExtraLib(typedBinary, 'typed-binary.d.ts');

  tsDefaults.setCompilerOptions({
    ...tsCompilerOptions,
    paths: {
      wigsill: ['wigsill/dist/index.d.ts'],
      'wigsill/data': ['wigsill/dist/data/index.d.ts'],
      'wigsill/macro': ['wigsill/dist/macro/index.d.ts'],
      'wigsill/web': ['wigsill/dist/web/index.d.ts'],
    },
  });
}

type Props = {
  code: string;
  onCodeChange: (value: string) => unknown;
};

export function CodeEditor(props: Props) {
  const { code, onCodeChange } = props;

  const handleChange = useEvent((value: string | undefined) => {
    onCodeChange(value ?? '');
  });

  return (
    <Editor
      defaultLanguage="typescript"
      value={code}
      onChange={handleChange}
      beforeMount={handleEditorWillMount}
    />
  );
}
