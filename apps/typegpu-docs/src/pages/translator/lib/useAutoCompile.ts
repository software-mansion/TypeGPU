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
  const lastCompiledCodeRef = useRef<{
    tgsl: string;
    wgsl: string;
    format: string;
  }>({
    tgsl: '',
    wgsl: '',
    format: '',
  });

  const debouncedCompile = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const currentCode = mode === TRANSLATOR_MODES.TGSL ? tgslCode : wgslCode;
      const lastCompiled = mode === TRANSLATOR_MODES.TGSL
        ? lastCompiledCodeRef.current.tgsl
        : lastCompiledCodeRef.current.wgsl;

      // Only compile if code or format actually changed
      if (
        canCompile && (
          currentCode !== lastCompiled ||
          format !== lastCompiledCodeRef.current.format
        )
      ) {
        lastCompiledCodeRef.current = {
          tgsl: tgslCode,
          wgsl: wgslCode,
          format: format,
        };
        handleCompile();
      }
    }, 1000);
  }, [canCompile, handleCompile, mode, tgslCode, wgslCode, format]);

  useEffect(() => {
    if (mode === TRANSLATOR_MODES.WGSL && wgslCode.trim() && canCompile) {
      debouncedCompile();
    }
  }, [wgslCode, mode, canCompile, debouncedCompile]);

  useEffect(() => {
    if (mode === TRANSLATOR_MODES.TGSL && tgslCode.trim() && canCompile) {
      debouncedCompile();
    }
  }, [tgslCode, mode, canCompile, debouncedCompile]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);
}
