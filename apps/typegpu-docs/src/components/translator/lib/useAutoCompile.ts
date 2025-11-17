import { useEffect } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  compileAtom,
  editorLoadingAtom,
  formatsAtom,
  modeAtom,
  tgslCodeAtom,
  wgslCodeAtom,
} from './translatorStore.ts';
import { TRANSLATOR_MODES } from './constants.ts';

export function useAutoCompile() {
  const mode = useAtomValue(modeAtom);
  const tgslCode = useAtomValue(tgslCodeAtom);
  const wgslCode = useAtomValue(wgslCodeAtom);
  const formats = useAtomValue(formatsAtom);
  const editorLoading = useAtomValue(editorLoadingAtom);
  const handleCompile = useSetAtom(compileAtom);

  useEffect(() => {
    const currentCode = mode === TRANSLATOR_MODES.TGSL ? tgslCode : wgslCode;

    const canAutoCompile =
      formats.length > 0 &&
      !editorLoading &&
      currentCode.trim().length > 0 &&
      (mode === TRANSLATOR_MODES.WGSL ||
        (mode === TRANSLATOR_MODES.TGSL && wgslCode.trim() !== ''));

    if (!canAutoCompile) {
      return;
    }

    const timer = setTimeout(() => {
      console.log('Auto-compiling...');
      void handleCompile();
    }, 1000);

    return () => clearTimeout(timer);
  }, [tgslCode, wgslCode, mode, handleCompile, editorLoading, formats]);
}
