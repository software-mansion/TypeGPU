import { useCallback, useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  canCompileAtom,
  compileAtom,
  formatAtom,
  modeAtom,
  tgslCodeAtom,
  wgslCodeAtom,
} from './translatorStore.ts';
import { TRANSLATOR_MODES } from './constants.ts';

export function useAutoCompile() {
  const mode = useAtomValue(modeAtom);
  const format = useAtomValue(formatAtom);
  const tgslCode = useAtomValue(tgslCodeAtom);
  const wgslCode = useAtomValue(wgslCodeAtom);
  const canCompile = useAtomValue(canCompileAtom);
  const handleCompile = useSetAtom(compileAtom);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastCompiledRef = useRef({ tgsl: '', wgsl: '', format: '' });

  const debouncedCompile = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const currentCode = mode === TRANSLATOR_MODES.TGSL ? tgslCode : wgslCode;
      const lastCode = mode === TRANSLATOR_MODES.TGSL
        ? lastCompiledRef.current.tgsl
        : lastCompiledRef.current.wgsl;

      if (
        canCompile &&
        (currentCode !== lastCode || format !== lastCompiledRef.current.format)
      ) {
        lastCompiledRef.current = { tgsl: tgslCode, wgsl: wgslCode, format };
        handleCompile();
      }
    }, 1000);
  }, [canCompile, handleCompile, mode, tgslCode, wgslCode, format]);

  useEffect(() => {
    const currentCode = mode === TRANSLATOR_MODES.TGSL ? tgslCode : wgslCode;
    if (currentCode.trim() && canCompile) {
      debouncedCompile();
    }
  }, [tgslCode, wgslCode, mode, canCompile, debouncedCompile]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
}
