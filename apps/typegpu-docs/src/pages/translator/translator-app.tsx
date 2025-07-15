import { useId } from 'react';
import { Editor } from '@monaco-editor/react';
import { commonEditorOptions, LANGUAGE_MAP } from './lib/constants.ts';
import { useShaderTranslator } from './lib/useShaderTranslator.ts';

const STATUS_COLOR_MAP: Record<string, string> = {
  initializing: 'text-yellow-500',
  ready: 'text-green-500',
  compiling: 'text-yellow-500',
  success: 'text-green-500',
  error: 'text-red-500',
};

const STATUS_TEXT: Record<string, string> = {
  initializing: 'Initializing…',
  ready: 'Ready to compile!',
  compiling: 'Compiling…',
  success: 'Compilation successful!',
  error: '',
};

const editorOptions = { ...commonEditorOptions, readOnly: false };
const outputEditorOptions = { ...commonEditorOptions, readOnly: true };

export default function TranslatorApp() {
  const {
    status,
    errorMessage,
    formats,
    wgslCode,
    output,
    format,
    canCompile,
    setWgslCode,
    setFormat,
    setEditorLoaded,
    handleCompile,
  } = useShaderTranslator();

  const formatSelectId = useId();
  const wgslInputLabelId = useId();
  const compiledOutputLabelId = useId();

  const statusColor = STATUS_COLOR_MAP[status];
  const statusText = status === 'error'
    ? errorMessage || 'An unexpected error happened.'
    : STATUS_TEXT[status];

  return (
    <div className='px-4'>
      <div className=' my-10'>
        <header className='mb-6 text-center'>
          <h1 className='font-bold text-3xl text-gray-900 dark:text-white'>
            WGSL Shader Translator
          </h1>
          <p className='text-gray-600 dark:text-gray-400'>
            Convert WGSL shaders to other formats
          </p>

          <div className='mt-4 text-center'>
            <span className={`font-medium text-sm ${statusColor}`}>
              {statusText}
              {status === 'initializing' && (
                <span className='ml-2 inline-block animate-spin'>⟳</span>
              )}
            </span>
          </div>
        </header>

        <div className='mb-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center'>
          <div className='flex items-center gap-2'>
            <label
              htmlFor={formatSelectId}
              className='font-medium text-gray-700 text-sm dark:text-gray-300'
            >
              Target Format:
            </label>
            <select
              id={formatSelectId}
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={!formats.length}
              className='rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white'
              title={!formats.length
                ? 'Loading available formats...'
                : 'Select target format'}
            >
              {formats.map((f) => (
                <option key={f} value={f}>
                  {f.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <button
            type='button'
            onClick={handleCompile}
            disabled={!canCompile}
            className='rounded-lg bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 px-6 py-2.5 font-medium text-sm text-white shadow-lg hover:from-purple-600 disabled:opacity-50'
          >
            {status === 'compiling'
              ? (
                <>
                  <span className='mr-2 inline-block animate-spin'>
                    ⟳
                  </span>Compiling…
                </>
              )
              : 'Compile Shader'}
          </button>
        </div>

        <div className='grid gap-6 lg:grid-cols-2'>
          <section className='overflow-hidden'>
            <div
              id={wgslInputLabelId}
              className='mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300'
            >
              WGSL Shader Code:
            </div>
            <div
              aria-labelledby={wgslInputLabelId}
              className='h-96 overflow-hidden rounded-lg border bg-white dark:bg-gray-700'
            >
              <Editor
                height='100%'
                language='wgsl'
                value={wgslCode}
                onChange={(v) => setWgslCode(v || '')}
                theme='vs-dark'
                onMount={setEditorLoaded}
                loading={
                  <div className='flex h-full items-center justify-center text-gray-500'>
                    Loading editor...
                  </div>
                }
                options={editorOptions}
              />
            </div>
          </section>

          <section className='overflow-hidden'>
            <div
              id={compiledOutputLabelId}
              className='mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300'
            >
              {`Compiled Output (${format.toUpperCase()}):`}
            </div>
            <div
              aria-labelledby={compiledOutputLabelId}
              className='h-96 overflow-hidden rounded-lg border bg-gray-50 dark:bg-gray-800'
            >
              <Editor
                height='100%'
                language={LANGUAGE_MAP[format] || 'plaintext'}
                value={output || '// Compiled output will appear here...'}
                theme='vs-dark'
                loading={
                  <div className='flex h-full items-center justify-center text-gray-500'>
                    Loading editor...
                  </div>
                }
                options={outputEditorOptions}
              />
            </div>
          </section>
        </div>

        {output && (
          <div className='mt-4 text-center'>
            <button
              type='button'
              onClick={() => navigator.clipboard.writeText(output)}
              className='rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 text-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300'
            >
              Copy Output
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
