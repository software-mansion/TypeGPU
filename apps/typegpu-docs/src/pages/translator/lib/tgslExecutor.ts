import { translateTGSL } from './translateTGSL.ts';

type TgslModule = Record<string, unknown>;

async function executeTgslModule(tgslCode: string): Promise<TgslModule> {
  const [tgpuModule, dataModule] = await Promise.all([
    import('typegpu'),
    import('typegpu/data'),
  ]);

  const translatedCode = translateTGSL(tgslCode);

  const exportedVariables = new Set<string>();
  const exportPattern = /^export\s+(?:const|let|var)\s+(\w+)\s*=/gm;

  let match: RegExpExecArray | null = exportPattern.exec(translatedCode);
  while (match !== null) {
    exportedVariables.add(match[1]);
    match = exportPattern.exec(translatedCode);
  }

  const codeToExecute = translatedCode
    .replace(/^import\s+.*?from\s+['"].*?['"];?\s*\n?/gm, '')
    .replace(/^export\s+/gm, '')
    .trim();

  const returnStatement = Array.from(exportedVariables)
    .map((name) => `...(typeof ${name} !== 'undefined' && { ${name} })`)
    .join(',\n        ');

  const executeCode = new Function(
    'tgpu',
    'd',
    `
      ${codeToExecute}

      return {
        ${returnStatement}
      };
    `,
  ) as (tgpu: unknown, d: unknown) => TgslModule;

  return executeCode(tgpuModule.default, dataModule);
}

export async function executeTgslCode(tgslCode: string): Promise<string> {
  try {
    const exports = await executeTgslModule(tgslCode);

    const tgpuModule = await import('typegpu');

    return tgpuModule.default.resolve({
      externals: exports,
    });
  } catch (error) {
    throw new Error(
      `Failed to execute TGSL code: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
