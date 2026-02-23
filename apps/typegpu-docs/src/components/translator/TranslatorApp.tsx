import { Editor } from '@monaco-editor/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect, useId } from 'react';
import { TranslatorHeader } from './components/TranslatorHeader.tsx';
import { TRANSLATOR_MODES } from './lib/constants.ts';
import {
  editableEditorOptions,
  LANGUAGE_MAP,
  readOnlyEditorOptions,
  setupMonacoEditor,
} from './lib/editorConfig.ts';
import {
  editorLoadingAtom,
  formatAtom,
  initializeAtom,
  modeAtom,
  outputAtom,
  tgslCodeAtom,
  wgslCodeAtom,
} from './lib/translatorStore.ts';
import { useAutoCompile } from './lib/useAutoCompile.ts';

interface EditorSectionProps {
  id: string;
  title: string;
  language: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  onMount?: () => void;
}

function EditorSection({
  id,
  title,
  language,
  value,
  onChange,
  readOnly,
  onMount,
}: EditorSectionProps) {
  return (
    <section className='flex min-h-[24rem] flex-col lg:min-h-0'>
      <h2
        id={id}
        className='mb-2 font-medium text-gray-300 text-sm'
      >
        {title}
      </h2>
      <Editor
        language={language}
        value={value}
        onChange={onChange ? (v) => onChange(v || '') : undefined}
        theme='vs-dark'
        beforeMount={language === 'typescript' ? setupMonacoEditor : undefined}
        onMount={onMount}
        loading={
          <div className='flex items-center justify-center text-gray-400'>
            Loading editor...
          </div>
        }
        options={readOnly ? readOnlyEditorOptions : editableEditorOptions}
      />
    </section>
  );
}

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
    void initialize();
  }, [initialize]);

  const handleEditorLoaded = () => setEditorLoaded(false);

  const isTgslMode = mode === TRANSLATOR_MODES.TGSL;
  const gridCols = isTgslMode
    ? 'grid-cols-1 lg:grid-cols-3'
    : 'grid-cols-1 lg:grid-cols-2';

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <TranslatorHeader />

      <main
        className={`grid flex-1 gap-4 overflow-y-auto p-4 ${gridCols}`}
      >
        {isTgslMode && (
          <EditorSection
            id={tgslInputLabelId}
            title='TypeScript Shader Code (TGSL):'
            language='typescript'
            value={tgslCode}
            onChange={setTgslCode}
            onMount={handleEditorLoaded}
          />
        )}

        <EditorSection
          id={wgslInputLabelId}
          title={isTgslMode ? 'Generated WGSL:' : 'WGSL Shader Code:'}
          language='wgsl'
          value={wgslCode}
          onChange={!isTgslMode ? setWgslCode : undefined}
          readOnly={isTgslMode}
          onMount={!isTgslMode ? handleEditorLoaded : undefined}
        />

        <EditorSection
          id={compiledOutputLabelId}
          title={`Compiled Output (${format.toUpperCase()}):`}
          language={LANGUAGE_MAP[format] || 'plaintext'}
          value={output || '// Compiled output will appear here...'}
          readOnly
        />
      </main>
    </div>
  );
}
