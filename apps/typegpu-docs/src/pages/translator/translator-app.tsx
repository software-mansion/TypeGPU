import { useAtom } from 'jotai';
import { useTranslatorService } from './store/translatorService.ts';
import { EditorPanel } from './components/EditorPanel.tsx';
import { Header } from './components/Header.tsx';
import { Controls } from './components/Controls.tsx';
import { LANGUAGE_MAP } from './lib/constants.ts';
import {
  formatAtom,
  loadingEditorAtom,
  outputAtom,
  wgslCodeAtom,
} from './store/store.ts';

export default function TranslatorApp() {
  const { handleCompile } = useTranslatorService();
  const [wgslCode, setWgslCode] = useAtom(wgslCodeAtom);
  const [output] = useAtom(outputAtom);
  const [format] = useAtom(formatAtom);
  const [, setLoadingEditor] = useAtom(loadingEditorAtom);

  return (
    <div className='px-4'>
      <div className=' my-10'>
        <Header />

        <Controls compile={handleCompile} />

        <div className='grid gap-6 lg:grid-cols-2'>
          <EditorPanel
            id='wgsl-input'
            label='WGSL Shader Code:'
            language='wgsl'
            value={wgslCode}
            onChange={setWgslCode}
            onMount={() => setLoadingEditor(false)}
          />

          <EditorPanel
            id='compiled-output'
            label={`Compiled Output (${format.toUpperCase()}):`}
            language={LANGUAGE_MAP[format] || 'plaintext'}
            value={output || '// Compiled output will appear here...'}
            readOnly
          />
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
