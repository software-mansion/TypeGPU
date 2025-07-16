import { useCallback, useEffect, useReducer } from 'react';
import { DEFAULT_WGSL } from './constants.ts';
import { compile, getErrorMessage, initializeWasm } from './wgslTool.ts';

type State = {
  status: 'initializing' | 'ready' | 'compiling' | 'success' | 'error';
  errorMessage?: string;
  formats: string[];
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
  | { type: 'SET_WGSL_CODE'; payload: string }
  | { type: 'SET_FORMAT'; payload: string }
  | { type: 'EDITOR_LOADED' };

const getInitialState = (): State => {
  const persistedFormat = typeof window !== 'undefined'
    ? localStorage.getItem('translator_format')
    : null;
  return {
    status: 'initializing',
    formats: [],
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

  const handleCompile = useCallback(() => {
    if (status === 'compiling') return;
    dispatch({ type: 'COMPILE_START' });
    try {
      const result = compile(wgslCode, format);
      dispatch({ type: 'COMPILE_SUCCESS', payload: result });
    } catch (err) {
      dispatch({ type: 'COMPILE_FAILURE', payload: getErrorMessage(err) });
    }
  }, [wgslCode, format, status]);

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
    status !== 'compiling';

  return {
    status,
    errorMessage,
    formats,
    wgslCode,
    output,
    format,
    loadingEditor,
    canCompile,
    setWgslCode,
    setFormat,
    setEditorLoaded,
    handleCompile,
  };
}
