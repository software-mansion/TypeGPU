import { useMemo } from 'react';
import { Editor, type OnMount } from '@monaco-editor/react';
import { commonEditorOptions } from '../lib/constants.ts';

interface EditorPanelProps {
  id: string;
  label: string;
  language: string;
  value: string;
  onChange?: (value: string) => void;
  onMount?: OnMount;
  readOnly?: boolean;
}

export function EditorPanel(
  { id, label, language, value, onChange, onMount, readOnly = false }:
    EditorPanelProps,
) {
  const editorOptions = useMemo(() => ({ ...commonEditorOptions, readOnly }), [
    readOnly,
  ]);

  return (
    <section className='overflow-hidden'>
      <div
        id={`${id}-label`}
        className='mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300'
      >
        {label}
      </div>
      <div
        id={id}
        aria-labelledby={`${id}-label`}
        className={`h-96 overflow-hidden rounded-lg border ${
          readOnly ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-700'
        }`}
      >
        <Editor
          height='100%'
          language={language}
          value={value}
          onChange={(v) => onChange?.(v || '')}
          theme='vs-dark'
          onMount={onMount}
          loading={
            <div className='flex h-full items-center justify-center text-gray-500'>
              Loading editor...
            </div>
          }
          options={editorOptions}
        />
      </div>
    </section>
  );
}
