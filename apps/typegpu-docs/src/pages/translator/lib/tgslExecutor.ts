import { translateTGSL } from './translateTGSL.ts';

/**
 * Execute TGSL code and convert to WGSL
 */
export async function executeTgslCode(tgslCode: string): Promise<string> {
  try {
    const translatedCode = translateTGSL(tgslCode);

    const [tgpuModule, dataModule] = await Promise.all([
      import('typegpu'),
      import('typegpu/data'),
    ]);

    const tgpu = tgpuModule.default;
    const d = dataModule;

    const codeToExecute = translatedCode
      .replace(/^import\s+.*?from\s+['"].*?['"];?\s*\n?/gm, '')
      .replace(/^export\s+/gm, '')
      .trim();

    const executeCode = new Function(
      'tgpu',
      'd',
      `
        ${codeToExecute}

        const exports = {};
        const variableMatches = ${
        JSON.stringify(codeToExecute)
      }.match(/(?:const|let|var)\\s+(\\w+)\\s*=/g);

        if (variableMatches) {
          for (const match of variableMatches) {
            const varName = match.match(/\\w+(?=\\s*=)/)[0];
            try {
              if (typeof eval(varName) !== 'undefined') {
                exports[varName] = eval(varName);
              }
            } catch (e) {
              // Skip variables that can't be evaluated
            }
          }
        }

        return exports;
      `,
    );

    const exportedVars = executeCode(tgpu, d);

    return tgpu.resolve({
      externals: exportedVars,
    });
  } catch (error) {
    throw new Error(
      `Failed to execute TGSL code: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Get error message from unknown error type
 */
export function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
