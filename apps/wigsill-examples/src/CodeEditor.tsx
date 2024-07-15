import Editor from '@monaco-editor/react';
import useEvent from './common/useEvent';

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
    <Editor defaultLanguage="javascript" value={code} onChange={handleChange} />
  );
}
