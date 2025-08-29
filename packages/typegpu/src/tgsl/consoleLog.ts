import { TgpuMutable } from '../core/buffer/bufferShorthand.ts';
import { fn } from '../core/function/tgpuFn.ts';
import type { TgpuRoot } from '../core/root/rootTypes.ts';
import { arrayOf } from '../data/array.ts';
import { u32 } from '../data/numeric.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { struct } from '../data/struct.ts';
import { U32, Void, WgslArray, WgslStruct } from '../data/wgslTypes.ts';
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
  buffer: TgpuMutable<
    WgslArray<
      LogData
    >
  >;
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
  #root: TgpuRoot;
  #options: Required<LogManagerOptions>;
  #dataSchema: LogData;
  #buffer: TgpuMutable<
    WgslArray<
      LogData
    >
  >;
  constructor(root: TgpuRoot, options: LogManagerOptions) {
    this.#root = root;

    if (options?.oneLogSize === undefined) {
      options.oneLogSize = 1;
    }
    if (options?.maxLogCount === undefined) {
      options.maxLogCount = 2;
    }
    this.#options = options as Required<LogManagerOptions>;

    this.#dataSchema = struct({
      id: u32,
      data: arrayOf(u32, options.oneLogSize),
    }).$name('log data schema');
    this.#buffer = root.createMutable(
      arrayOf(this.#dataSchema, options.maxLogCount),
    ).$name('log buffer');
  }

  getMetadata(): LogMetadata | undefined {
    return {
      buffer: this.#buffer,
      options: this.#options,
    };
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

    const log = fn([u32])`(loggedValue) {
      buffer[0].id = 1;
      buffer[0].data[0] = loggedValue;
    }`.$uses({ buffer: this.#buffer }).$name('log');
    return snip(`${ctx.resolve(log)}(${args[0].value})`, Void);
  }
}
