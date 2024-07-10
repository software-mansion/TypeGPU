import useEvent from '../common/useEvent';
import { CodeEditor } from '../CodeEditor';
import type { Example } from './types';
import { useMemo, useState } from 'react';
import { debounce } from 'remeda';

type Props = {
  example: Example;
};

export function ExampleView({ example }: Props) {
  const { code: initialCode, metadata } = example;
  const [code, setCode] = useState(initialCode);

  const setCodeDebouncer = useMemo(
    () => debounce(setCode, { waitMs: 500 }),
    [setCode],
  );

  const handleCodeChange = useEvent((newCode: string) => {
    setCodeDebouncer.call(newCode);
  });

  return (
    <>
      <p>Hello {metadata.title}</p>
      <CodeEditor code={code} onCodeChange={handleCodeChange} />
    </>
  );
}
