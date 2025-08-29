import { TgpuMutable } from '../core/buffer/bufferShorthand.ts';
import { fn } from '../core/function/tgpuFn.ts';
import type { TgpuRoot } from '../core/root/rootTypes.ts';
import { arrayOf } from '../data/array.ts';
import { atomic } from '../data/atomic.ts';
import { u32 } from '../data/numeric.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { struct } from '../data/struct.ts';
import { Atomic, U32, Void, WgslArray, WgslStruct } from '../data/wgslTypes.ts';
import { GenerationCtx } from './generationHelpers.ts';

const fallbackSnippet = snip('/* console.log() */', Void);

export interface LogManagerOptions {
  oneLogSize?: number;
  maxLogCount?: number;
}

export interface LogManager {
  registerLog(ctx: GenerationCtx, args: Snippet[]): Snippet;
  getMetadata(): LogMetadata | undefined;
}

export interface LogMetadata {
  dataIndexBuffer: TgpuMutable<Atomic<U32>>;
  dataBuffer: TgpuMutable<WgslArray<LogData>>;
  options: Required<LogManagerOptions>;
}

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

type LogData = WgslStruct<{
  id: U32;
  data: WgslArray<U32>;
}>;

export class LogManagerImpl implements LogManager {
  #metaData: LogMetadata;
  #nextLogId = 1;
  constructor(root: TgpuRoot, options: LogManagerOptions) {
    if (options?.oneLogSize === undefined) {
      options.oneLogSize = 1;
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
    };
  }

  getMetadata(): LogMetadata | undefined {
    return this.#nextLogId === 1 ? undefined : this.#metaData;
  }

  registerLog(ctx: GenerationCtx, args: Snippet[]): Snippet {
    if (args.length !== 1) {
      console.warn('Currently only logs of exactly 1 argument are supported.');
      return snip('/* console.log() */', Void);
    }
    if (args[0]?.dataType !== u32) {
      console.warn("Currently only values of type 'u32' can be logged.");
      return snip('/* console.log() */', Void);
    }
    const id = this.#nextLogId++;

    const log = fn([u32])`(loggedValue) {
      var dataIndex = atomicAdd(&dataIndexBuffer, 1);
      dataBuffer[dataIndex].id = ${id};
      dataBuffer[dataIndex].data[0] = loggedValue;
    }`.$uses({
      dataIndexBuffer: this.#metaData.dataIndexBuffer,
      dataBuffer: this.#metaData.dataBuffer,
    }).$name(`log ${id}`);

    return snip(`${ctx.resolve(log)}(${args[0].value})`, Void);
  }
}
