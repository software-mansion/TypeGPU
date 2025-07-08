import { useAtom } from 'jotai';
import {
  formatAtom,
  formatsAtom,
  isCompilingAtom,
  loadingEditorAtom,
  outputAtom,
  readyAtom,
} from '../store/store.ts';

interface ControlsProps {
  compile: () => void;
}

export function Controls({ compile }: ControlsProps) {
  const [formats] = useAtom(formatsAtom);
  const [format, setFormat] = useAtom(formatAtom);
  const [, setOutput] = useAtom(outputAtom);
  const [ready] = useAtom(readyAtom);
  const [isCompiling] = useAtom(isCompilingAtom);
  const [loadingEditor] = useAtom(loadingEditorAtom);

  return (
    <div className='mb-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-center'>
      <div className='flex items-center gap-2'>
        <label
          htmlFor='format-select'
          className='font-medium text-gray-700 text-sm dark:text-gray-300'
        >
          Target Format:
        </label>
        <select
          id='format-select'
          value={format}
          onChange={(e) => {
            setFormat(e.target.value);
            setOutput('');
          }}
          disabled={!ready}
          className='rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white'
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
        onClick={compile}
        disabled={!ready || isCompiling || loadingEditor}
        className='rounded-lg bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 px-6 py-2.5 font-medium text-sm text-white shadow-lg hover:from-purple-600 disabled:opacity-50'
      >
        {isCompiling
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
  );
}
