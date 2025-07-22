import { useId } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  canCompileAtom,
  canConvertTgslAtom,
  clearOutputOnFormatChangeAtom,
  clearOutputOnModeChangeAtom,
  compileAtom,
  convertTgslToWgslAtom,
  errorMessageAtom,
  formatAtom,
  formatsAtom,
  modeAtom,
  statusAtom,
} from '../lib/translatorStore.ts';
import { TRANSLATOR_MODES, type TranslatorMode } from '../lib/constants.ts';

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

export function TranslatorHeader() {
  const mode = useAtomValue(modeAtom);
  const format = useAtomValue(formatAtom);
  const status = useAtomValue(statusAtom);
  const errorMessage = useAtomValue(errorMessageAtom);
  const formats = useAtomValue(formatsAtom);
  const canCompile = useAtomValue(canCompileAtom);
  const canConvertTgsl = useAtomValue(canConvertTgslAtom);

  const setMode = useSetAtom(clearOutputOnModeChangeAtom);
  const setFormat = useSetAtom(clearOutputOnFormatChangeAtom);
  const handleTgslToWgsl = useSetAtom(convertTgslToWgslAtom);
  const handleCompile = useSetAtom(compileAtom);

  const modeSelectId = useId();
  const formatSelectId = useId();

  const statusColor = STATUS_COLOR_MAP[status];
  const statusText = status === 'error'
    ? errorMessage || 'An unexpected error happened.'
    : STATUS_TEXT[status];

  return (
    <header className='flex-shrink-0 border-gray-200 border-b px-3 py-3 sm:px-4 sm:py-4 dark:border-gray-700'>
      <div className='mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-start sm:justify-between'>
        <h1 className='font-bold text-gray-900 text-lg sm:text-xl dark:text-white'>
          {mode === TRANSLATOR_MODES.TGSL ? 'TGSL' : 'WGSL'} Translator
        </h1>
        <div className='mr-4 h-12 w-full overflow-y-auto rounded border bg-gray-50 px-2 py-1 sm:mr-0 sm:h-10 sm:max-w-sm dark:border-gray-600 dark:bg-gray-800'>
          <div
            className={`font-medium text-xs sm:text-sm ${statusColor} leading-tight`}
          >
            {statusText}
          </div>
        </div>
      </div>

      <div className='flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4'>
        <div className='flex items-center gap-2'>
          <label
            htmlFor={modeSelectId}
            className='font-medium text-gray-700 text-xs sm:text-sm dark:text-gray-300'
          >
            Mode:
          </label>
          <select
            id={modeSelectId}
            value={mode}
            onChange={(e) => setMode(e.target.value as TranslatorMode)}
            className='rounded-md border px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white'
          >
            <option value={TRANSLATOR_MODES.WGSL}>WGSL</option>
            <option value={TRANSLATOR_MODES.TGSL}>TGSL</option>
          </select>
        </div>

        <div className='flex items-center gap-2'>
          <label
            htmlFor={formatSelectId}
            className='font-medium text-gray-700 text-xs sm:text-sm dark:text-gray-300'
          >
            Target:
          </label>
          <select
            id={formatSelectId}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            disabled={!formats.length}
            className='rounded-md border px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white'
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

        <div className='flex gap-2'>
          {mode === TRANSLATOR_MODES.TGSL && (
            <button
              type='button'
              onClick={() => handleTgslToWgsl()}
              disabled={!canConvertTgsl}
              className='rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white text-xs hover:bg-blue-700 disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm'
            >
              {status === 'compiling' ? 'Converting…' : 'Convert'}
            </button>
          )}

          <button
            type='button'
            onClick={() => handleCompile()}
            disabled={!canCompile}
            className='rounded-lg bg-purple-600 px-3 py-1.5 font-medium text-white text-xs hover:bg-purple-700 disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm'
          >
            {status === 'compiling' ? 'Compiling…' : 'Compile Now'}
          </button>
        </div>
      </div>
    </header>
  );
}
