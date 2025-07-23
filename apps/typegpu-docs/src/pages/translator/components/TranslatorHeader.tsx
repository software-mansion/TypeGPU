import { useId } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  canCompileAtom,
  canConvertTgslAtom,
  clearOutputOnFormatChangeAtom,
  clearOutputOnModeChangeAtom,
  compileAtom,
  convertTgslToWgslAtom,
  formatAtom,
  formatsAtom,
  modeAtom,
  statusAtom,
} from '../lib/translatorStore.ts';
import { TRANSLATOR_MODES, type TranslatorMode } from '../lib/constants.ts';

const STATUS_CONFIG = {
  initializing: { color: 'text-violet-400', text: 'Initializing…' },
  ready: { color: 'text-emerald-400', text: 'Ready to compile!' },
  compiling: { color: 'text-violet-400', text: 'Compiling…' },
  success: { color: 'text-emerald-400', text: 'Compilation successful!' },
  error: { color: 'text-red-400', text: '' },
} as const;

export function TranslatorHeader() {
  const mode = useAtomValue(modeAtom);
  const format = useAtomValue(formatAtom);
  const { state: status, error: errorMessage } = useAtomValue(statusAtom);
  const formats = useAtomValue(formatsAtom);
  const canCompile = useAtomValue(canCompileAtom);
  const canConvertTgsl = useAtomValue(canConvertTgslAtom);

  const setMode = useSetAtom(clearOutputOnModeChangeAtom);
  const setFormat = useSetAtom(clearOutputOnFormatChangeAtom);
  const handleTgslToWgsl = useSetAtom(convertTgslToWgslAtom);
  const handleCompile = useSetAtom(compileAtom);

  const modeSelectId = useId();
  const formatSelectId = useId();

  const statusConfig = STATUS_CONFIG[status];
  const statusText = status === 'error'
    ? errorMessage || 'An unexpected error happened.'
    : statusConfig.text;

  return (
    <header className='flex-shrink-0 border-gray-200 border-b px-3 py-3 sm:px-4 sm:py-4 dark:border-gray-700'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-[1fr_320px] sm:gap-4'>
        <h1 className='font-bold text-gray-900 text-lg sm:text-xl dark:text-white'>
          {mode === TRANSLATOR_MODES.TGSL ? 'TGSL' : 'WGSL'} Translator
        </h1>

        <div className='h-12 overflow-y-auto rounded-lg border border-gray-600 bg-gray-800/50 px-3 py-2 backdrop-blur-sm sm:h-10'>
          <div
            className={`min-h-[1.25rem] font-medium text-xs leading-tight sm:text-sm ${statusConfig.color}`}
          >
            {statusText}
          </div>
        </div>
      </div>

      <div className='mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-[auto_auto_1fr] sm:items-center sm:gap-4'>
        <div className='flex items-center gap-3'>
          <label
            htmlFor={modeSelectId}
            className='w-10 font-medium text-gray-300 text-xs sm:text-sm'
          >
            Mode:
          </label>
          <select
            id={modeSelectId}
            value={mode}
            onChange={(e) => setMode(e.target.value as TranslatorMode)}
            className='min-w-[5rem] rounded-lg border border-gray-600 bg-gray-700/80 px-3 py-2 text-white text-xs backdrop-blur-sm transition-all hover:bg-gray-600 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 sm:min-w-[6rem] sm:text-sm'
          >
            <option value={TRANSLATOR_MODES.WGSL}>WGSL</option>
            <option value={TRANSLATOR_MODES.TGSL}>TGSL</option>
          </select>
        </div>

        <div className='flex items-center gap-3'>
          <label
            htmlFor={formatSelectId}
            className='w-12 font-medium text-gray-300 text-xs sm:text-sm'
          >
            Target:
          </label>
          <select
            id={formatSelectId}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            disabled={!formats.length}
            className='min-w-[6rem] rounded-lg border border-gray-600 bg-gray-700/80 px-3 py-2 text-white text-xs backdrop-blur-sm transition-all hover:bg-gray-600 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50 disabled:hover:bg-gray-700/80 sm:min-w-[7rem] sm:text-sm'
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

        <div className='flex justify-start gap-3 sm:justify-end'>
          {mode === TRANSLATOR_MODES.TGSL && (
            <button
              type='button'
              onClick={() => handleTgslToWgsl()}
              disabled={!canConvertTgsl}
              className='rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2.5 font-medium text-white text-xs shadow-md transition-all hover:from-indigo-500 hover:to-purple-500 hover:shadow-lg disabled:opacity-50 disabled:hover:from-indigo-600 disabled:hover:to-purple-600 disabled:hover:shadow-md sm:px-5 sm:py-2.5 sm:text-sm'
            >
              {status === 'compiling' ? 'Converting…' : 'Convert'}
            </button>
          )}

          <button
            type='button'
            onClick={() => handleCompile()}
            disabled={!canCompile}
            className='rounded-lg bg-gradient-to-r from-purple-600 to-violet-700 px-4 py-2.5 font-medium text-white text-xs shadow-md transition-all hover:from-purple-500 hover:to-violet-600 hover:shadow-lg disabled:opacity-50 disabled:hover:from-purple-600 disabled:hover:to-violet-700 disabled:hover:shadow-md sm:px-5 sm:py-2.5 sm:text-sm'
          >
            {status === 'compiling' ? 'Compiling…' : 'Compile Now'}
          </button>
        </div>
      </div>
    </header>
  );
}
