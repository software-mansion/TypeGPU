import { entries, filter, fromEntries, isTruthy, map, pipe } from 'remeda';
import type { Monaco } from '@monaco-editor/react';
import type { SandboxModuleDefinition } from '../../../utils/examples/sandboxModules.ts';
import { tsnotoverCompilerOptions } from '../../../utils/liveEditor/embeddedTypeScript.ts';

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

export const setupMonacoEditor =
  (sandboxModules: Record<string, SandboxModuleDefinition>) => (monaco: Monaco) => {
    const tsDefaults = monaco?.languages.typescript.typescriptDefaults;
    const sandboxModulesEntries = entries(sandboxModules);

    const reroutes = pipe(
      sandboxModulesEntries,
      map(([key, moduleDef]) => {
        if ('reroute' in moduleDef.typeDef) {
          return [key, [moduleDef.typeDef.reroute]] as [string, string[]];
        }
        return null;
      }),
      filter(isTruthy),
      fromEntries(),
    );

    for (const [moduleKey, moduleDef] of sandboxModulesEntries) {
      if ('content' in moduleDef.typeDef) {
        tsDefaults.addExtraLib(moduleDef.typeDef.content, moduleDef.typeDef.filename);

        if (moduleDef.typeDef.filename && moduleDef.typeDef.filename !== moduleKey) {
          reroutes[moduleKey] = [...(reroutes[moduleKey] ?? []), moduleDef.typeDef.filename];
        }
      }
    }

    tsDefaults.setCompilerOptions({
      ...tsnotoverCompilerOptions,
      paths: reroutes,
    });
  };
