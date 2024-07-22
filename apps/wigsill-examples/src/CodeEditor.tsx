import Editor, { type Monaco } from '@monaco-editor/react';
import webgpuTypes from '@webgpu/types/dist/index.d.ts?raw';
import typedBinary from 'typed-binary/dist/index.d.ts?raw';
import wigsill from 'wigsill/dist/index.d.ts?raw';
import useEvent from './common/useEvent';
import { tsCompilerOptions } from './embeddedTypeScript';
import toolkitTypes from './types/example-toolkit.d.ts?raw';

function handleEditorWillMount(monaco: Monaco) {
  const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

  tsDefaults.addExtraLib(webgpuTypes);
  tsDefaults.addExtraLib(wigsill, 'wigsill.d.ts');
  tsDefaults.addExtraLib(toolkitTypes, 'example-toolkit.d.ts');
  tsDefaults.addExtraLib(typedBinary, 'typed-binary.d.ts');

  tsDefaults.setCompilerOptions(tsCompilerOptions);
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
