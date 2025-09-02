import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import { stitch } from '../../core/resolve/stitch.ts';
import type { TgpuRoot } from '../../core/root/rootTypes.ts';
import { arrayOf } from '../../data/array.ts';
import { atomic } from '../../data/atomic.ts';
import { u32 } from '../../data/numeric.ts';
import { snip, type Snippet } from '../../data/snippet.ts';
import { struct } from '../../data/struct.ts';
import {
  type AnyWgslData,
  type Atomic,
  type U32,
  Void,
  type WgslArray,
} from '../../data/wgslTypes.ts';
import type { GenerationCtx } from '../generationHelpers.ts';
import { createLoggingFunction } from './serializers.ts';
import type {
  LogManager,
  LogManagerOptions,
  LogResources,
  SerializedLogCallData,
} from './types.ts';

const fallbackSnippet = snip('/* console.log() */', Void);

export class LogManagerNullImpl implements LogManager {
  get logResources(): undefined {
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
  #dataIndexBuffer: TgpuMutable<Atomic<U32>>;
  #dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>;
  #options: Required<LogManagerOptions>;
  #logIdToSchema: Map<number, (string | AnyWgslData)[]>;
  #nextLogId = 1;

  constructor(root: TgpuRoot, options: LogManagerOptions) {
    if (options?.oneLogSize === undefined) {
      options.oneLogSize = 64;
    }
    if (options?.maxLogCount === undefined) {
      options.maxLogCount = 256;
    }
    this.#options = options as Required<LogManagerOptions>;
    this.#logIdToSchema = new Map();

    const DataSchema = struct({
      id: u32,
      data: arrayOf(u32, options.oneLogSize),
    }).$name('log data schema');

    this.#dataBuffer = root
      .createMutable(arrayOf(DataSchema, options.maxLogCount))
      .$name('log buffer');

    this.#dataIndexBuffer = root.createMutable(atomic(u32));
  }

  get logResources(): LogResources | undefined {
    return this.#nextLogId === 1 ? undefined : {
      dataBuffer: this.#dataBuffer,
      dataIndexBuffer: this.#dataIndexBuffer,
      options: this.#options,
      logIdToSchema: this.#logIdToSchema,
    };
  }

  // AAA snippet types should be concretized before passing them here
  registerLog(ctx: GenerationCtx, args: Snippet[]): Snippet {
    const id = this.#nextLogId++;
    const nonStringArgs = args
      .filter((e) => typeof e !== 'string')
      .map((e) => e.dataType) as AnyWgslData[];

    const logFn = createLoggingFunction(
      id,
      nonStringArgs,
      this.#dataBuffer,
      this.#dataIndexBuffer,
    );

    this.#logIdToSchema.set(id, nonStringArgs);

    return snip(stitch`${ctx.resolve(logFn)}(${args})`, Void);
  }
}
