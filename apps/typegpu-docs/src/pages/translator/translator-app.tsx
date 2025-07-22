import { useId } from 'react';
import { Editor, type Monaco } from '@monaco-editor/react';
import { entries, filter, fromEntries, isTruthy, map, pipe } from 'remeda';
import {
  commonEditorOptions,
  LANGUAGE_MAP,
  TRANSLATOR_MODES,
} from './lib/constants.ts';
import { useShaderTranslator } from './lib/useShaderTranslator.ts';
import { SANDBOX_MODULES } from '../../utils/examples/sandboxModules.ts';
import { tsCompilerOptions } from '../../utils/liveEditor/embeddedTypeScript.ts';

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

function handleEditorWillMount(monaco: Monaco) {
  const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

  const reroutes = pipe(
    entries(SANDBOX_MODULES),
    map(([key, moduleDef]) => {
      if ('reroute' in moduleDef.typeDef) {
        return [key, moduleDef.typeDef.reroute] as const;
      }
      return null;
    }),
    filter(isTruthy),
    fromEntries(),
  );

  for (const [moduleKey, moduleDef] of entries(SANDBOX_MODULES)) {
    if ('content' in moduleDef.typeDef) {
      tsDefaults.addExtraLib(
        moduleDef.typeDef.content,
        moduleDef.typeDef.filename,
      );

      if (
        moduleDef.typeDef.filename &&
        moduleDef.typeDef.filename !== moduleKey
      ) {
        reroutes[moduleKey] = [
          ...(reroutes[moduleKey] ?? []),
          moduleDef.typeDef.filename,
        ];
      }
    }
  }

  tsDefaults.setCompilerOptions({
    ...tsCompilerOptions,
    paths: reroutes,
  });
}

const editorOptions = {
  ...commonEditorOptions,
  readOnly: false,
  fixedOverflowWidgets: true,
};
const outputEditorOptions = {
  ...commonEditorOptions,
  readOnly: true,
  fixedOverflowWidgets: true,
};

export default function TranslatorApp() {
  const {
    status,
    errorMessage,
    formats,
    mode,
    tgslCode,
    wgslCode,
    output,
    format,
    canCompile,
    canConvertTgsl,
    setMode,
    setTgslCode,
    setWgslCode,
    setFormat,
    setEditorLoaded,
    handleTgslToWgsl,
    handleCompile,
  } = useShaderTranslator();

  const modeSelectId = useId();
  const formatSelectId = useId();
  const tgslInputLabelId = useId();
  const wgslInputLabelId = useId();
  const compiledOutputLabelId = useId();

  const statusColor = STATUS_COLOR_MAP[status];
  const statusText = status === 'error'
    ? errorMessage || 'An unexpected error happened.'
    : STATUS_TEXT[status];

  return (
    <div className='flex h-screen flex-col'>
      <div className='flex-shrink-0 border-gray-200 border-b px-4 py-4 dark:border-gray-700'>
        <div className='mb-4 flex items-center justify-between'>
          <h1 className='font-bold text-gray-900 text-xl dark:text-white'>
            {mode === TRANSLATOR_MODES.TGSL ? 'TGSL' : 'WGSL'} Translator
          </h1>
          <span className={`font-medium text-sm ${statusColor}`}>
            {statusText}
          </span>
        </div>

        <div className='flex flex-wrap items-center gap-4'>
          <div className='flex items-center gap-2'>
            <label
              htmlFor={modeSelectId}
              className='font-medium text-gray-700 text-sm dark:text-gray-300'
            >
              Mode:
            </label>
            <select
              id={modeSelectId}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              className='rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white'
            >
              <option value={TRANSLATOR_MODES.WGSL}>WGSL</option>
              <option value={TRANSLATOR_MODES.TGSL}>TGSL</option>
            </select>
          </div>

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

          {mode === TRANSLATOR_MODES.TGSL && (
            <button
              type='button'
              onClick={handleTgslToWgsl}
              disabled={!canConvertTgsl}
              className='rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-sm text-white hover:bg-blue-700 disabled:opacity-50'
            >
              {status === 'compiling' ? 'Converting…' : 'Convert to WGSL'}
            </button>
          )}

          <button
            type='button'
            onClick={handleCompile}
            disabled={!canCompile}
            className='rounded-lg bg-purple-600 px-6 py-2.5 font-medium text-sm text-white hover:bg-purple-700 disabled:opacity-50'
          >
            {status === 'compiling'
              ? 'Compiling…'
              : mode === TRANSLATOR_MODES.TGSL
              ? 'Convert & Compile'
              : 'Compile Shader'}
          </button>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto p-4 lg:overflow-hidden'>
        <div
          className={`grid gap-4 lg:h-full ${
            mode === TRANSLATOR_MODES.TGSL
              ? 'grid-cols-1 lg:grid-cols-3'
              : 'grid-cols-1 lg:grid-cols-2'
          }`}
        >
          {mode === TRANSLATOR_MODES.TGSL && (
            <section className='flex h-96 flex-col lg:h-full'>
              <div
                id={tgslInputLabelId}
                className='mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300'
              >
                TypeScript Shader Code (TGSL):
              </div>
              <div
                aria-labelledby={tgslInputLabelId}
                className='flex-1 overflow-visible rounded-lg border bg-white dark:bg-gray-700'
              >
                <Editor
                  height='100%'
                  language='typescript'
                  value={tgslCode}
                  onChange={(v) => setTgslCode(v || '')}
                  theme='vs-dark'
                  beforeMount={handleEditorWillMount}
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
          )}

          <section className='flex h-96 flex-col lg:h-full'>
            <div
              id={wgslInputLabelId}
              className='mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300'
            >
              {mode === TRANSLATOR_MODES.TGSL
                ? 'Generated WGSL:'
                : 'WGSL Shader Code:'}
            </div>
            <div
              aria-labelledby={wgslInputLabelId}
              className={`flex-1 overflow-visible rounded-lg border ${
                mode === TRANSLATOR_MODES.TGSL
                  ? 'bg-gray-50 dark:bg-gray-800'
                  : 'bg-white dark:bg-gray-700'
              }`}
            >
              <Editor
                height='100%'
                language='wgsl'
                value={wgslCode}
                onChange={mode === TRANSLATOR_MODES.WGSL
                  ? (v) => setWgslCode(v || '')
                  : undefined}
                theme='vs-dark'
                onMount={mode === TRANSLATOR_MODES.WGSL
                  ? setEditorLoaded
                  : undefined}
                loading={
                  <div className='flex h-full items-center justify-center text-gray-500'>
                    Loading editor...
                  </div>
                }
                options={mode === TRANSLATOR_MODES.TGSL
                  ? outputEditorOptions
                  : editorOptions}
              />
            </div>
          </section>

          <section className='flex h-96 flex-col lg:h-full'>
            <div
              id={compiledOutputLabelId}
              className='mb-2 block font-medium text-gray-700 text-sm dark:text-gray-300'
            >
              {`Compiled Output (${format.toUpperCase()}):`}
            </div>
            <div
              aria-labelledby={compiledOutputLabelId}
              className='flex-1 overflow-visible rounded-lg border bg-gray-50 dark:bg-gray-800'
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
      </div>
    </div>
  );
}
