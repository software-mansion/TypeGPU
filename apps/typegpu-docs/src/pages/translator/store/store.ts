import { atom } from 'jotai';
import { DEFAULT_WGSL } from '../lib/constants.ts';

export const wgslCodeAtom = atom(DEFAULT_WGSL);
export const outputAtom = atom('');
export const formatsAtom = atom<string[]>([]);
export const formatAtom = atom('glsl');
export const statusAtom = atom('Initializing…');
export const isCompilingAtom = atom(false);
export const readyAtom = atom(false);
export const loadingEditorAtom = atom(true);

export const statusColorAtom = atom((get) => {
  const status = get(statusAtom);
  if (/fail(ed)?/i.test(status)) return 'text-red-500';
  if (/success|ready/i.test(status)) return 'text-green-500';
  return 'text-yellow-500';
});
