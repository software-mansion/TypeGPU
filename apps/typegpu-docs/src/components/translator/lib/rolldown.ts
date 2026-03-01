import type { InputOptions, OutputOptions } from '@rolldown/browser';
import { join } from 'pathe';

export interface BundleResult {
  output: Record<string, string | Uint8Array<ArrayBuffer>>;
  warnings?: string[] | undefined;
}

export interface SourceFile {
  filename: string;
  code: string;
  isEntry?: boolean;
}

export type FileMap = Record<
  string,
  | {
      content: string;
    }
  | {
      reroute: string;
    }
  | undefined
>;

export async function bundle(
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
        // oxlint-disable-next-line typescript/no-base-to-string
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
          const id = source[0] === '.' ? join(importer || '/', '..', source) : source;

          if (files[id] && 'reroute' in files[id]) {
            // Rerouting
            return files[id].reroute;
          }

          return id;
        },
        load(id) {
          if (!files[id]) {
            return;
          }

          if ('reroute' in files[id]) {
            // Reroutes are supposed to be resolved in `resolveId`
            throw new Error(`Unresolved reroute for ${id}`);
          }

          return files[id].content;
        },
      },
      ...(Array.isArray(config?.plugins) ? config.plugins : [config?.plugins].filter(Boolean)),
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
        : [chunk.fileName, chunk.source.slice()],
    ),
  );

  return {
    output,
    warnings,
  };
}
