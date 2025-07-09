import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { compile, getErrorMessage, initializeWasm } from '../lib/wgslTool.ts';
import {
  formatAtom,
  formatsAtom,
  isCompilingAtom,
  outputAtom,
  readyAtom,
  statusAtom,
  wgslCodeAtom,
} from './store.ts';

export function useTranslatorService() {
  const [, setFormats] = useAtom(formatsAtom);
  const [, setStatus] = useAtom(statusAtom);
  const [, setReady] = useAtom(readyAtom);
  const [wgslCode] = useAtom(wgslCodeAtom);
  const [format] = useAtom(formatAtom);
  const [, setOutput] = useAtom(outputAtom);
  const [, setIsCompiling] = useAtom(isCompilingAtom);

  useEffect(() => {
    try {
      const fmts = initializeWasm();
      setFormats(fmts);
      setStatus('Ready to compile!');
      setReady(true);
    } catch (err) {
      setStatus(`Failed to load: ${getErrorMessage(err)}`);
    }
  }, [setFormats, setStatus, setReady]);

  const handleCompile = useCallback(() => {
    setIsCompiling(true);
    setStatus('Compiling…');

    try {
      const result = compile(wgslCode, format);
      setOutput(result);
      setStatus('Compilation successful!');
    } catch (err) {
      setOutput('');
      setStatus(`Compilation failed: ${getErrorMessage(err)}`);
    } finally {
      setIsCompiling(false);
    }
  }, [wgslCode, format, setIsCompiling, setStatus, setOutput]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCompile();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleCompile]);

  return { handleCompile };
}
