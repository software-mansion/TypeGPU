import { CodeEditor } from '../CodeEditor';
import useEvent from '../common/useEvent';
import { Example } from '../examples';

type Props = {
  example: Example;
};

export function ExampleView({ example }: Props) {
  const { code: initialCode, metadata } = example;

  const handleCodeChange = useEvent(() => {
    // TODO
  });

  return (
    <>
      <p>Hello {metadata.title}</p>
      <CodeEditor code={initialCode} onCodeChange={handleCodeChange} />
    </>
  );
}
