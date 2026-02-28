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
  const statusText =
    status === 'error' ? errorMessage || 'An unexpected error happened.' : statusConfig.text;

  return (
    <header className="border-b px-2 pb-2">
      <div className="mb-4 grid grid-cols-[1fr_auto] items-center gap-4">
        <h1 className="font-bold text-xl">
          {mode === TRANSLATOR_MODES.TGSL ? 'TGSL' : 'WGSL'} Translator
        </h1>

        <div className="rounded border bg-gray-800 p-1">
          <div className={`max-h-20 overflow-y-auto text-sm ${statusConfig.color}`}>
            {statusText}
          </div>
        </div>
      </div>

      <div className="grid min-w-3xs grid-cols-2 items-center gap-4 sm:grid-cols-[auto_auto_1fr_auto]">
        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
          <label htmlFor={modeSelectId} className="text-sm">
            Mode:
          </label>
          <select
            id={modeSelectId}
            value={mode}
            onChange={(e) => setMode(e.target.value as TranslatorMode)}
            className="rounded border bg-gray-700 p-2 text-white"
          >
            <option value={TRANSLATOR_MODES.WGSL}>WGSL</option>
            <option value={TRANSLATOR_MODES.TGSL}>TGSL</option>
          </select>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
          <label htmlFor={formatSelectId} className="text-sm">
            Target:
          </label>
          <select
            id={formatSelectId}
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            disabled={!formats.length}
            className="rounded border bg-gray-700 p-2 text-white disabled:opacity-50"
            title={!formats.length ? 'Loading available formats...' : 'Select target format'}
          >
            {formats.map((f) => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-2 grid grid-flow-col gap-2 sm:col-span-1 sm:col-start-4">
          {mode === TRANSLATOR_MODES.TGSL && (
            <button
              type="button"
              onClick={() => handleTgslToWgsl()}
              disabled={!canConvertTgsl}
              className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {status === 'compiling' ? 'Converting…' : 'Convert'}
            </button>
          )}

          <button
            type="button"
            onClick={() => handleCompile()}
            disabled={!canCompile}
            className="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {status === 'compiling' ? 'Compiling…' : 'Compile Now'}
          </button>
        </div>
      </div>
    </header>
  );
}
