import { resolve } from 'pathe';
import type { InputOptions, OutputOptions } from '@rolldown/browser';

export interface BundleResult {
  output: Record<string, string | Uint8Array>;
  warnings?: string[] | undefined;
}

export interface SourceFile {
  filename: string;
  code: string;
  isEntry?: boolean;
}

export type FileMap = Record<string, string>;

export async function main(
  files: FileMap,
  entries: string[],
  config: InputOptions & { output?: OutputOptions | undefined } = {},
): Promise<BundleResult> {
  const rolldown = await import('@rolldown/browser');

  const warnings: string[] = [];

  const inputOptions: InputOptions = {
    input: entries,
    cwd: '/',
    onLog(level, log, logger) {
      if (level === 'warn') {
        warnings.push(String(log));
      } else {
        logger(level, log);
      }
    },
    ...config,
    plugins: [
      // Virtual file system plugin
      {
        name: 'virtual-fs',
        resolveId(source, importer) {
          if (source[0] === '/' || source[0] === '.') {
            return resolve(importer || '/', '..', source);
          }
        },
        load(id) {
          if (id[0] !== '/') return;
          const filename = id.slice(1);
          return files[filename];
        },
      },
      ...(Array.isArray(config?.plugins)
        ? config.plugins
        : [config?.plugins].filter(Boolean)),
    ],
  };

  const outputOptions: OutputOptions = {
    format: 'esm',
    ...config?.output,
  };

  const bundle = await rolldown.rolldown(inputOptions);
  const result = await bundle.generate(outputOptions);

  const output = Object.fromEntries(
    result.output.map((chunk) =>
      chunk.type === 'chunk'
        ? [chunk.fileName, chunk.code]
        : [chunk.fileName, chunk.source]
    ),
  );

  return {
    output,
    warnings,
  };
}
