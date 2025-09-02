import type { TgpuRoot } from '../../core/root/rootTypes.ts';
import { arrayOf } from '../../data/array.ts';
import { atomic } from '../../data/atomic.ts';
import { u32 } from '../../data/numeric.ts';
import { snip, type Snippet } from '../../data/snippet.ts';
import { struct } from '../../data/struct.ts';
import { type AnyWgslData, Void } from '../../data/wgslTypes.ts';
import type { GenerationCtx } from '../generationHelpers.ts';
import { createLoggingFunction } from './serializers.ts';
import type { LogManager, LogManagerOptions, LogMetadata } from './types.ts';

const fallbackSnippet = snip('/* console.log() */', Void);

export class LogManagerDummyImpl implements LogManager {
  getMetadata(): undefined {
    return undefined;
  }
  registerLog(): Snippet {
    console.warn(
      "'console.log' is currently only supported in compute pipelines.",
    );
    return fallbackSnippet;
  }
}

export class LogManagerImpl implements LogManager {
  #metaData: LogMetadata;
  #nextLogId = 1;
  constructor(root: TgpuRoot, options: LogManagerOptions) {
    if (options?.oneLogSize === undefined) {
      options.oneLogSize = 64;
    }
    if (options?.maxLogCount === undefined) {
      options.maxLogCount = 256;
    }
    const sanitizedOptions = options as Required<LogManagerOptions>;

    const DataSchema = struct({
      id: u32,
      data: arrayOf(u32, sanitizedOptions.oneLogSize),
    }).$name('log data schema');

    const dataBuffer = root
      .createMutable(arrayOf(DataSchema, sanitizedOptions.maxLogCount))
      .$name('log buffer');

    const dataIndexBuffer = root.createMutable(atomic(u32));

    this.#metaData = {
      dataIndexBuffer,
      dataBuffer,
      options: sanitizedOptions,
      logIdToSchema: new Map(),
    };
  }

  getMetadata(): LogMetadata | undefined {
    return this.#nextLogId === 1 ? undefined : this.#metaData;
  }

  registerLog(ctx: GenerationCtx, args: Snippet[]): Snippet {
    const id = this.#nextLogId++;
    const nonStringArgs = args
      .filter((e) => typeof e !== 'string')
      .map((e) => e.dataType) as AnyWgslData[];

    const logFn = createLoggingFunction(
      id,
      nonStringArgs,
      this.#metaData.dataBuffer,
      this.#metaData.dataIndexBuffer,
    );

    this.#metaData.logIdToSchema.set(id, nonStringArgs);

    return snip(
      `${ctx.resolve(logFn)}(${args.map((e) => e.value).join(', ')})`,
      Void,
    );
  }
}
