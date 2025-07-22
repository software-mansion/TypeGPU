import { useEffect, useId } from 'react';
import { Editor } from '@monaco-editor/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  editorLoadingAtom,
  formatAtom,
  initializeAtom,
  modeAtom,
  outputAtom,
  tgslCodeAtom,
  wgslCodeAtom,
} from './lib/translatorStore.ts';
import { TRANSLATOR_MODES } from './lib/constants.ts';
import {
  editableEditorOptions,
  LANGUAGE_MAP,
  readOnlyEditorOptions,
  setupMonacoEditor,
} from './lib/editorConfig.ts';
import { useAutoCompile } from './lib/useAutoCompile.ts';
import { TranslatorHeader } from './components/TranslatorHeader.tsx';

export default function TranslatorApp() {
  const mode = useAtomValue(modeAtom);
  const format = useAtomValue(formatAtom);
  const output = useAtomValue(outputAtom);
  const [tgslCode, setTgslCode] = useAtom(tgslCodeAtom);
  const [wgslCode, setWgslCode] = useAtom(wgslCodeAtom);
  const setEditorLoaded = useSetAtom(editorLoadingAtom);
  const initialize = useSetAtom(initializeAtom);

  const tgslInputLabelId = useId();
  const wgslInputLabelId = useId();
  const compiledOutputLabelId = useId();

  useAutoCompile();

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleEditorLoaded = () => setEditorLoaded(false);

  return (
    <div className='flex h-screen flex-col overflow-hidden'>
      <TranslatorHeader />

      <main className='min-h-0 flex-1 overflow-y-auto lg:overflow-hidden'>
        <div
          className={`grid h-full gap-4 p-4 ${
            mode === TRANSLATOR_MODES.TGSL
              ? 'grid-cols-1 lg:grid-cols-3'
              : 'grid-cols-1 lg:grid-cols-2'
          }`}
        >
          {mode === TRANSLATOR_MODES.TGSL && (
            <section className='flex min-h-[24rem] flex-col lg:min-h-0'>
              <h2
                id={tgslInputLabelId}
                className='mb-2 font-medium text-gray-700 text-sm dark:text-gray-300'
              >
                TypeScript Shader Code (TGSL):
              </h2>
              <div
                aria-labelledby={tgslInputLabelId}
                className='min-h-0 flex-1 overflow-hidden rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-900'
              >
                <div className='h-full overflow-visible'>
                  <Editor
                    height='100%'
                    language='typescript'
                    value={tgslCode}
                    onChange={(v) => setTgslCode(v || '')}
                    theme='vs-dark'
                    beforeMount={setupMonacoEditor}
                    onMount={handleEditorLoaded}
                    loading={
                      <div className='flex h-full items-center justify-center text-gray-500'>
                        Loading editor...
                      </div>
                    }
                    options={editableEditorOptions}
                  />
                </div>
              </div>
            </section>
          )}

          <section className='flex min-h-[24rem] flex-col lg:min-h-0'>
            <h2
              id={wgslInputLabelId}
              className='mb-2 font-medium text-gray-700 text-sm dark:text-gray-300'
            >
              {mode === TRANSLATOR_MODES.TGSL
                ? 'Generated WGSL:'
                : 'WGSL Shader Code:'}
            </h2>
            <div
              aria-labelledby={wgslInputLabelId}
              className={`min-h-0 flex-1 overflow-hidden rounded-lg border ${
                mode === TRANSLATOR_MODES.TGSL
                  ? 'bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                  : 'bg-white dark:border-gray-700 dark:bg-gray-900'
              }`}
            >
              <div className='h-full overflow-visible'>
                <Editor
                  height='100%'
                  language='wgsl'
                  value={wgslCode}
                  onChange={mode === TRANSLATOR_MODES.WGSL
                    ? (v) => setWgslCode(v || '')
                    : undefined}
                  theme='vs-dark'
                  onMount={mode === TRANSLATOR_MODES.WGSL
                    ? handleEditorLoaded
                    : undefined}
                  loading={
                    <div className='flex h-full items-center justify-center text-gray-500'>
                      Loading editor...
                    </div>
                  }
                  options={mode === TRANSLATOR_MODES.TGSL
                    ? readOnlyEditorOptions
                    : editableEditorOptions}
                />
              </div>
            </div>
          </section>

          <section className='flex min-h-[24rem] flex-col lg:min-h-0'>
            <h2
              id={compiledOutputLabelId}
              className='mb-2 font-medium text-gray-700 text-sm dark:text-gray-300'
            >
              {`Compiled Output (${format.toUpperCase()}):`}
            </h2>
            <div
              aria-labelledby={compiledOutputLabelId}
              className='min-h-0 flex-1 overflow-hidden rounded-lg border bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
            >
              <div className='h-full overflow-visible'>
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
                  options={readOnlyEditorOptions}
                />
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
