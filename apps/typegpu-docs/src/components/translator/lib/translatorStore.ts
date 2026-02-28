import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { DEFAULT_TGSL, DEFAULT_WGSL, TRANSLATOR_MODES, type TranslatorMode } from './constants.ts';
import { compile, initializeWasm } from './wgslTool.ts';
import { executeTgslCode, getErrorMessage } from './tgslExecutor.ts';

export const formatAtom = atomWithStorage('translator_format', 'glsl');
export const modeAtom = atomWithStorage<TranslatorMode>('translator_mode', TRANSLATOR_MODES.WGSL);

export const tgslCodeAtom = atom(DEFAULT_TGSL);
export const wgslCodeAtom = atom(DEFAULT_WGSL);
export const outputAtom = atom('');
export const formatsAtom = atom<string[]>([]);
export const editorLoadingAtom = atom(true);

export const statusAtom = atom<{
  state: 'initializing' | 'ready' | 'compiling' | 'success' | 'error';
  error?: string;
}>({ state: 'initializing' });

export const canCompileAtom = atom((get) => {
  const { state } = get(statusAtom);
  const formats = get(formatsAtom);
  const editorLoading = get(editorLoadingAtom);
  const mode = get(modeAtom);
  const wgslCode = get(wgslCodeAtom);

  return (
    formats.length > 0 &&
    !editorLoading &&
    state !== 'compiling' &&
    (mode === TRANSLATOR_MODES.WGSL || (mode === TRANSLATOR_MODES.TGSL && wgslCode.trim() !== ''))
  );
});

export const canConvertTgslAtom = atom((get) => {
  const { state } = get(statusAtom);
  const mode = get(modeAtom);
  const editorLoading = get(editorLoadingAtom);

  return mode === TRANSLATOR_MODES.TGSL && !editorLoading && state !== 'compiling';
});

export const initializeAtom = atom(null, async (_, set) => {
  try {
    const formats = initializeWasm();
    set(formatsAtom, formats);
    set(statusAtom, { state: 'ready' });
  } catch (error) {
    set(statusAtom, { state: 'error', error: getErrorMessage(error) });
  }
});

export const convertTgslToWgslAtom = atom(null, async (get, set) => {
  const { state } = get(statusAtom);
  if (state === 'compiling') return;

  set(statusAtom, { state: 'compiling' });
  try {
    const tgslCode = get(tgslCodeAtom);
    const result = await executeTgslCode(tgslCode);
    set(wgslCodeAtom, result);
    set(statusAtom, { state: 'ready' });
  } catch (error) {
    set(statusAtom, { state: 'error', error: getErrorMessage(error) });
  }
});

export const compileAtom = atom(null, async (get, set) => {
  const { state } = get(statusAtom);
  if (state === 'compiling') return;

  set(statusAtom, { state: 'compiling' });

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

    set(statusAtom, { state: 'success' });
  } catch (error) {
    set(statusAtom, { state: 'error', error: getErrorMessage(error) });
    set(outputAtom, '');
  }
});

export const clearOutputOnModeChangeAtom = atom(null, (_, set, mode: TranslatorMode) => {
  set(modeAtom, mode);
  set(outputAtom, '');

  if (mode === TRANSLATOR_MODES.TGSL) {
    set(statusAtom, { state: 'ready' });
  }
});

export const clearOutputOnFormatChangeAtom = atom(null, (_, set, format: string) => {
  set(formatAtom, format);
  set(outputAtom, '');
});
