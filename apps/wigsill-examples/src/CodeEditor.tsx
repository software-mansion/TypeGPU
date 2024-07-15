import Editor, { Monaco } from '@monaco-editor/react';
import { languages } from 'monaco-editor';
import webgpuTypes from '@webgpu/types/dist/index.d.ts?raw';
import wigsill from './types/wigsill-types.d.ts?raw';
import toolkitTypes from './types/example-toolkit.d.ts?raw';
import typedBinary from 'typed-binary/dist/index.d.ts?raw';

import useEvent from './common/useEvent';

type Props = {
  code: string;
  onCodeChange: (value: string) => unknown;
};

export function CodeEditor(props: Props) {
  const { code, onCodeChange } = props;

  function handleEditorWillMount(monaco: Monaco) {
    const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

    tsDefaults.addExtraLib(webgpuTypes);
    tsDefaults.addExtraLib(wigsill, 'wigsill.d.ts');
    tsDefaults.addExtraLib(toolkitTypes, 'example-toolkit.d.ts');
    tsDefaults.addExtraLib(typedBinary, 'typed-binary.d.ts');

    tsDefaults.setCompilerOptions({
      target: languages.typescript.ScriptTarget.ESNext,
      allowNonTsExtensions: true,
      strict: true,
      esModuleInterop: true,
      module: languages.typescript.ModuleKind.ESNext,
      noUncheckedIndexedAccess: true,
      noEmit: true,
      skipLibCheck: true,
      exactOptionalPropertyTypes: true,
      baseUrl: '.',
      lib: ['dom', 'es2021'],
      typeRoots: ['./node_modules/@webgpu/types', './node_modules/@types'],
    });
  }

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
