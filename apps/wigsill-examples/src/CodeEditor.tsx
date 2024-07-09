import Editor from '@monaco-editor/react';

export function CodeEditor() {
  return (
    <Editor
      height="90vh"
      defaultLanguage="typescript"
      defaultValue="// some comment"
    />
  );
}
