import { GUI } from 'dat.gui';
import Editor from '@monaco-editor/react';
import { useCallback, useEffect, useRef } from 'react';

import useEvent from './common/useEvent';
import { ExampleState } from './common/exampleState';
import { executeExample } from './exampleRunner';

type Props = {
  code: string;
  onCodeChange: (value: string) => unknown;
};

function useLayout() {
  const defineLayout = useCallback(() => {
    console.log(`Layout defined`);
  }, []);

  return [null, defineLayout] as const;
}

function useExample(exampleCode: string) {
  const exampleRef = useRef<ExampleState | null>(null);
  const [_layout, defineLayout] = useLayout();

  useEffect(() => {
    let cancelled = false;

    console.log('MAKE');
    const gui = new GUI({ closeOnTop: true });
    gui.hide();

    executeExample(exampleCode, defineLayout).then((example) => {
      if (cancelled) {
        // Another instance was started in the meantime.
        example.dispose();
        return;
      }

      // Success
      exampleRef.current = example;
      gui.show();
    });

    return () => {
      console.log('BREAK');
      exampleRef.current?.dispose();
      cancelled = true;
      gui.destroy();
    };
  }, [exampleCode, defineLayout]);
}

export function CodeEditor(props: Props) {
  const { code, onCodeChange } = props;

  const handleChange = useEvent((value: string | undefined) => {
    onCodeChange(value ?? '');
  });

  useExample(code);

  return (
    <Editor
      height="90vh"
      defaultLanguage="javascript"
      value={code}
      onChange={handleChange}
    />
  );
}
