import { atom } from 'jotai';

export const codeEditorShownAtom = atom(window.innerWidth > 1024);
