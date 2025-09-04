import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import { stitch } from '../../core/resolve/stitch.ts';
import type { TgpuRoot } from '../../core/root/rootTypes.ts';
import { arrayOf } from '../../data/array.ts';
import { atomic } from '../../data/atomic.ts';
import { UnknownData } from '../../data/dataTypes.ts';
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
import { $internal } from '../../shared/symbols.ts';
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
  #logCallIndexBuffer: TgpuMutable<Atomic<U32>>;
  #serializedLogDataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>;
  #options: Required<LogManagerOptions>;
  #logIdToArgTypes: Map<number, (string | AnyWgslData)[]>;
  #firstUnusedId = 1;

  constructor(root: TgpuRoot) {
    const options = root[$internal].logOptions;
    if (options?.serializedLogDataSizeLimit === undefined) {
      options.serializedLogDataSizeLimit = 2 ** 4 - 1;
    }
    if (options?.logCountPerDispatchLimit === undefined) {
      options.logCountPerDispatchLimit = 2 ** 6;
    }
    this.#options = options as Required<LogManagerOptions>;
    this.#logIdToArgTypes = new Map();

    const SerializedLogData = struct({
      id: u32,
      serializedData: arrayOf(u32, options.serializedLogDataSizeLimit),
    }).$name('SerializedLogData');

    this.#serializedLogDataBuffer = root
      .createMutable(
        arrayOf(SerializedLogData, options.logCountPerDispatchLimit),
      )
      .$name('serializedLogDataBuffer');

    this.#logCallIndexBuffer = root
      .createMutable(atomic(u32))
      .$name('logCallIndexBuffer');
  }

  get logResources(): LogResources | undefined {
    return this.#firstUnusedId === 1 ? undefined : {
      serializedLogDataBuffer: this.#serializedLogDataBuffer,
      logCallIndexBuffer: this.#logCallIndexBuffer,
      options: this.#options,
      logIdToArgTypes: this.#logIdToArgTypes,
    };
  }

  // AAA snippet types should be concretized before passing them here
  /**
   * Generates all necessary resources for serializing arguments for logging purposes.
   *
   * @param ctx Resolution context.
   * @param args Argument snippets. Snippets of UnknownType will be treated as string literals.
   * @returns A snippet containing the call to the logging function.
   */
  registerLog(ctx: GenerationCtx, args: Snippet[]): Snippet {
    const id = this.#firstUnusedId++;
    const nonStringArgs = args
      .filter((e) => e.dataType !== UnknownData);

    const logFn = createLoggingFunction(
      id,
      nonStringArgs.map((e) => e.dataType as AnyWgslData),
      this.#serializedLogDataBuffer,
      this.#logCallIndexBuffer,
    );

    this.#logIdToArgTypes.set(
      id,
      args.map((e) =>
        e.dataType === UnknownData
          ? (e.value as string)
          : e.dataType as AnyWgslData
      ),
    );

    return snip(stitch`${ctx.resolve(logFn)}(${nonStringArgs})`, Void);
  }
}
