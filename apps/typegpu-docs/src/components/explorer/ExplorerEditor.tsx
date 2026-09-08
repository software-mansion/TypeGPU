import Editor from '@monaco-editor/react';
import { useRef } from 'react';
import { useAtomValue } from 'jotai';
import { configureMonaco } from '../../utils/liveEditor/monaco.ts';

import { sandboxModulesAtom } from '../../utils/examples/sandboxModules.ts';
import { editableEditorOptions, setupMonacoEditor } from '../translator/lib/editorConfig.ts';

configureMonaco();

export default function ExplorerEditor({
  value,
  onChange,
  onResolve,
  dark,
  path = 'explorer.ts',
  tsoverEnabled = false,
}: {
  tsoverEnabled?: boolean;
  path?: string;
  value: string;
  onChange: (value: string) => void;
  dark: boolean;
  onResolve: () => void;
}) {
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;
  const modules = useAtomValue(sandboxModulesAtom);
  return (
    <Editor
      language="typescript"
      path={path}
      value={value}
      onChange={(code) => onChange(code ?? '')}
      theme={dark ? 'vs-dark' : 'vs'}
      beforeMount={setupMonacoEditor(modules, tsoverEnabled)}
      onMount={(editor, monaco) => {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
          onResolveRef.current(),
        );
      }}
      options={{
        ...editableEditorOptions,
        ariaLabel: 'TypeScript source',
        padding: { top: 20 },
        fontSize: 13,
      }}
    />
  );
}
