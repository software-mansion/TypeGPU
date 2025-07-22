import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  DEFAULT_TGSL,
  DEFAULT_WGSL,
  TRANSLATOR_MODES,
  type TranslatorMode,
} from './constants.ts';
import { compile, getErrorMessage, initializeWasm } from './wgslTool.ts';
import { executeTgslCode } from './tgslExecutor.ts';

// Persisted atoms
export const formatAtom = atomWithStorage('translator_format', 'glsl');
export const modeAtom = atomWithStorage<TranslatorMode>(
  'translator_mode',
  TRANSLATOR_MODES.WGSL,
);

// Basic state atoms
export const tgslCodeAtom = atom(DEFAULT_TGSL);
export const wgslCodeAtom = atom(DEFAULT_WGSL);
export const outputAtom = atom('');
export const formatsAtom = atom<string[]>([]);
export const editorLoadingAtom = atom(true);

// Status atoms
export const statusAtom = atom<
  'initializing' | 'ready' | 'compiling' | 'success' | 'error'
>('initializing');
export const errorMessageAtom = atom<string | undefined>(undefined);

// Derived atoms
export const canCompileAtom = atom((get) => {
  const formats = get(formatsAtom);
  const loadingEditor = get(editorLoadingAtom);
  const status = get(statusAtom);
  const mode = get(modeAtom);
  const wgslCode = get(wgslCodeAtom);

  return formats.length > 0 &&
    !loadingEditor &&
    status !== 'compiling' &&
    (mode === TRANSLATOR_MODES.WGSL ||
      (mode === TRANSLATOR_MODES.TGSL && wgslCode.trim() !== ''));
});

export const canConvertTgslAtom = atom((get) => {
  const mode = get(modeAtom);
  const loadingEditor = get(editorLoadingAtom);
  const status = get(statusAtom);

  return mode === TRANSLATOR_MODES.TGSL &&
    !loadingEditor &&
    status !== 'compiling';
});

// Action atoms
export const initializeAtom = atom(null, async (get, set) => {
  try {
    const formats = initializeWasm();
    set(formatsAtom, formats);
    set(statusAtom, 'ready');
  } catch (error) {
    set(statusAtom, 'error');
    set(errorMessageAtom, getErrorMessage(error));
  }
});

export const convertTgslToWgslAtom = atom(null, async (get, set) => {
  const status = get(statusAtom);
  if (status === 'compiling') return;

  set(statusAtom, 'compiling');
  try {
    const tgslCode = get(tgslCodeAtom);
    const result = await executeTgslCode(tgslCode);
    set(wgslCodeAtom, result);
    set(statusAtom, 'ready');
  } catch (error) {
    set(statusAtom, 'error');
    set(errorMessageAtom, getErrorMessage(error));
  }
});

export const compileAtom = atom(null, async (get, set) => {
  const status = get(statusAtom);
  if (status === 'compiling') return;

  set(statusAtom, 'compiling');

  try {
    const mode = get(modeAtom);
    const format = get(formatAtom);

    if (mode === TRANSLATOR_MODES.TGSL) {
      const tgslCode = get(tgslCodeAtom);
      const wgslResult = await executeTgslCode(tgslCode);
      set(wgslCodeAtom, wgslResult);
      const compiledResult = compile(wgslResult, format);
      set(outputAtom, compiledResult);
    } else {
      const wgslCode = get(wgslCodeAtom);
      const result = compile(wgslCode, format);
      set(outputAtom, result);
    }

    set(statusAtom, 'success');
  } catch (error) {
    set(statusAtom, 'error');
    set(errorMessageAtom, getErrorMessage(error));
    set(outputAtom, '');
  }
});

// Clear output when mode changes
export const clearOutputOnModeChangeAtom = atom(
  null,
  (get, set, mode: TranslatorMode) => {
    set(modeAtom, mode);
    set(outputAtom, '');
    set(statusAtom, mode === TRANSLATOR_MODES.TGSL ? 'ready' : get(statusAtom));
  },
);

// Clear output when format changes
export const clearOutputOnFormatChangeAtom = atom(
  null,
  (get, set, format: string) => {
    set(formatAtom, format);
    set(outputAtom, '');
  },
);
