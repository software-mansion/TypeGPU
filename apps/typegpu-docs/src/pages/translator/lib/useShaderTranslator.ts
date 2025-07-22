import { useCallback, useEffect, useReducer } from 'react';
import {
  DEFAULT_TGSL,
  DEFAULT_WGSL,
  TRANSLATOR_MODES,
  type TranslatorMode,
} from './constants.ts';
import { compile, getErrorMessage, initializeWasm } from './wgslTool.ts';
import { executeTgslCode } from './tgslExecutor.ts';

type State = {
  status: 'initializing' | 'ready' | 'compiling' | 'success' | 'error';
  errorMessage?: string;
  formats: string[];
  mode: TranslatorMode;
  tgslCode: string;
  wgslCode: string;
  output: string;
  format: string;
  loadingEditor: boolean;
};

type Action =
  | { type: 'INIT_SUCCESS'; payload: string[] }
  | { type: 'INIT_FAILURE'; payload: string }
  | { type: 'COMPILE_START' }
  | { type: 'COMPILE_SUCCESS'; payload: string }
  | { type: 'COMPILE_FAILURE'; payload: string }
  | { type: 'TGSL_TO_WGSL_SUCCESS'; payload: string }
  | { type: 'TGSL_TO_WGSL_FAILURE'; payload: string }
  | { type: 'SET_MODE'; payload: TranslatorMode }
  | { type: 'SET_TGSL_CODE'; payload: string }
  | { type: 'SET_WGSL_CODE'; payload: string }
  | { type: 'SET_FORMAT'; payload: string }
  | { type: 'EDITOR_LOADED' };

const getInitialState = (): State => {
  const persistedFormat = typeof window !== 'undefined'
    ? localStorage.getItem('translator_format')
    : null;
  const persistedMode = typeof window !== 'undefined'
    ? localStorage.getItem('translator_mode') as TranslatorMode
    : null;
  return {
    status: 'initializing',
    formats: [],
    mode: persistedMode || TRANSLATOR_MODES.WGSL,
    tgslCode: DEFAULT_TGSL,
    wgslCode: DEFAULT_WGSL,
    output: '',
    format: persistedFormat || 'glsl',
    loadingEditor: true,
  };
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'INIT_SUCCESS':
      return {
        ...state,
        status: 'ready',
        formats: action.payload,
      };
    case 'INIT_FAILURE':
      return {
        ...state,
        status: 'error',
        errorMessage: action.payload,
      };
    case 'COMPILE_START':
      return {
        ...state,
        status: 'compiling',
      };
    case 'COMPILE_SUCCESS':
      return {
        ...state,
        status: 'success',
        output: action.payload,
      };
    case 'COMPILE_FAILURE':
      return {
        ...state,
        status: 'error',
        errorMessage: action.payload,
        output: '',
      };
    case 'TGSL_TO_WGSL_SUCCESS':
      return {
        ...state,
        wgslCode: action.payload,
        status: 'ready',
      };
    case 'TGSL_TO_WGSL_FAILURE':
      return {
        ...state,
        status: 'error',
        errorMessage: action.payload,
      };
    case 'SET_MODE':
      return {
        ...state,
        mode: action.payload,
        output: '',
        status: action.payload === TRANSLATOR_MODES.TGSL
          ? 'ready'
          : state.status,
      };
    case 'SET_TGSL_CODE':
      return { ...state, tgslCode: action.payload };
    case 'SET_WGSL_CODE':
      return { ...state, wgslCode: action.payload };
    case 'SET_FORMAT':
      return { ...state, format: action.payload, output: '' };
    case 'EDITOR_LOADED':
      return { ...state, loadingEditor: false };
    default:
      return state;
  }
}

export function useShaderTranslator() {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);
  const {
    status,
    errorMessage,
    formats,
    mode,
    tgslCode,
    wgslCode,
    output,
    format,
    loadingEditor,
  } = state;

  useEffect(() => {
    try {
      const fmts = initializeWasm();
      dispatch({ type: 'INIT_SUCCESS', payload: fmts });
    } catch (err) {
      dispatch({ type: 'INIT_FAILURE', payload: getErrorMessage(err) });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('translator_format', format);
  }, [format]);

  useEffect(() => {
    localStorage.setItem('translator_mode', mode);
  }, [mode]);

  const handleTgslToWgsl = useCallback(async () => {
    if (status === 'compiling') return;
    dispatch({ type: 'COMPILE_START' });
    try {
      const result = await executeTgslCode(tgslCode);
      dispatch({ type: 'TGSL_TO_WGSL_SUCCESS', payload: result });
    } catch (err) {
      dispatch({ type: 'TGSL_TO_WGSL_FAILURE', payload: getErrorMessage(err) });
    }
  }, [tgslCode, status]);

  const handleCompile = useCallback(async () => {
    if (status === 'compiling') return;
    dispatch({ type: 'COMPILE_START' });

    try {
      if (mode === TRANSLATOR_MODES.TGSL) {
        const wgslResult = await executeTgslCode(tgslCode);
        dispatch({ type: 'TGSL_TO_WGSL_SUCCESS', payload: wgslResult });
        const compiledResult = compile(wgslResult, format);
        dispatch({ type: 'COMPILE_SUCCESS', payload: compiledResult });
      } else {
        const result = compile(wgslCode, format);
        dispatch({ type: 'COMPILE_SUCCESS', payload: result });
      }
    } catch (err) {
      dispatch({ type: 'COMPILE_FAILURE', payload: getErrorMessage(err) });
    }
  }, [tgslCode, wgslCode, format, status, mode]);

  const setMode = (newMode: TranslatorMode) => {
    dispatch({ type: 'SET_MODE', payload: newMode });
  };

  const setTgslCode = (code: string) => {
    dispatch({ type: 'SET_TGSL_CODE', payload: code });
  };

  const setWgslCode = (code: string) => {
    dispatch({ type: 'SET_WGSL_CODE', payload: code });
  };

  const setFormat = (newFormat: string) => {
    dispatch({ type: 'SET_FORMAT', payload: newFormat });
  };

  const setEditorLoaded = () => {
    dispatch({ type: 'EDITOR_LOADED' });
  };

  const canCompile = formats.length > 0 && !loadingEditor &&
    status !== 'compiling' && (
      mode === TRANSLATOR_MODES.WGSL ||
      (mode === TRANSLATOR_MODES.TGSL && wgslCode.trim() !== '')
    );

  const canConvertTgsl = mode === TRANSLATOR_MODES.TGSL && !loadingEditor &&
    status !== 'compiling';

  return {
    status,
    errorMessage,
    formats,
    mode,
    tgslCode,
    wgslCode,
    output,
    format,
    loadingEditor,
    canCompile,
    canConvertTgsl,
    setMode,
    setTgslCode,
    setWgslCode,
    setFormat,
    setEditorLoaded,
    handleTgslToWgsl,
    handleCompile,
  };
}
