import { entries, filter, fromEntries, isTruthy, map, pipe } from 'remeda';
import type { Monaco } from '@monaco-editor/react';
import { SANDBOX_MODULES } from '../../../utils/examples/sandboxModules.ts';
import { tsCompilerOptions } from '../../../utils/liveEditor/embeddedTypeScript.ts';

export const LANGUAGE_MAP: Record<string, string> = {
  wgsl: 'wgsl',
  glsl: 'cpp',
  hlsl: 'cpp',
  metal: 'cpp',
  spirv: 'plaintext',
  'spirv-asm': 'plaintext',
};

const baseEditorOptions = {
  minimap: { enabled: false },
  fontSize: 14,
  fontFamily: 'Monaco, "Cascadia Code", "Roboto Mono", monospace',
  wordWrap: 'off' as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  renderWhitespace: 'selection' as const,
  lineNumbers: 'on' as const,
  folding: true,
  bracketPairColorization: { enabled: true },
  fixedOverflowWidgets: true,
} as const;

export const editableEditorOptions = {
  ...baseEditorOptions,
  readOnly: false,
};

export const readOnlyEditorOptions = {
  ...baseEditorOptions,
  readOnly: true,
};

export function setupMonacoEditor(monaco: Monaco) {
  const tsDefaults = monaco?.languages.typescript.typescriptDefaults;

  const reroutes = pipe(
    entries(SANDBOX_MODULES),
    map(([key, moduleDef]) => {
      if ('reroute' in moduleDef.typeDef) {
        return [key, [moduleDef.typeDef.reroute]] as [string, string[]];
      }
      return null;
    }),
    filter(isTruthy),
    fromEntries(),
  );

  for (const [moduleKey, moduleDef] of entries(SANDBOX_MODULES)) {
    if ('content' in moduleDef.typeDef) {
      tsDefaults.addExtraLib(moduleDef.typeDef.content, moduleDef.typeDef.filename);

      if (moduleDef.typeDef.filename && moduleDef.typeDef.filename !== moduleKey) {
        reroutes[moduleKey] = [...(reroutes[moduleKey] ?? []), moduleDef.typeDef.filename];
      }
    }
  }

  tsDefaults.setCompilerOptions({
    ...tsCompilerOptions,
    paths: reroutes,
  });
}
