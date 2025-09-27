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
import {
  concretizeSnippets,
  type GenerationCtx,
} from '../generationHelpers.ts';
import { createLoggingFunction } from './serializers.ts';
import type {
  LogGenerator,
  LogGeneratorOptions,
  LogResources,
  SerializedLogCallData,
} from './types.ts';

const defaultOptions: Required<LogGeneratorOptions> = {
  logCountLimit: 64,
  logSizeLimit: 252,
  messagePrefix: '%c GPU %c ',
};

export class LogGeneratorNullImpl implements LogGenerator {
  get logResources(): undefined {
    return undefined;
  }
  generateLog(): Snippet {
    console.warn(
      "'console.log' is currently only supported in compute pipelines.",
    );
    return snip('/* console.log() */', Void, /* ref */ undefined);
  }
}

export class LogGeneratorImpl implements LogGenerator {
  #options: Required<LogGeneratorOptions>;
  #logIdToArgTypes: Map<number, (string | AnyWgslData)[]>;
  #firstUnusedId = 1;
  #indexBuffer: TgpuMutable<Atomic<U32>>;
  #dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>;

  constructor(root: TgpuRoot) {
    this.#options = { ...defaultOptions, ...root[$internal].logOptions };
    this.#logIdToArgTypes = new Map();

    const SerializedLogData = struct({
      id: u32,
      serializedData: arrayOf(u32, Math.ceil(this.#options.logSizeLimit / 4)),
    }).$name('SerializedLogData');

    this.#dataBuffer = root
      .createMutable(arrayOf(SerializedLogData, this.#options.logCountLimit))
      .$name('dataBuffer');

    this.#indexBuffer = root
      .createMutable(atomic(u32))
      .$name('indexBuffer');
  }

  /**
   * Generates all necessary resources for serializing arguments for logging purposes.
   *
   * @param ctx Resolution context.
   * @param args Argument snippets. Snippets of UnknownType will be treated as string literals.
   * @returns A snippet containing the call to the logging function.
   */
  generateLog(ctx: GenerationCtx, args: Snippet[]): Snippet {
    const concreteArgs = concretizeSnippets(args);
    const id = this.#firstUnusedId++;

    const nonStringArgs = concreteArgs
      .filter((e) => e.dataType !== UnknownData);

    const logFn = createLoggingFunction(
      id,
      nonStringArgs.map((e) => e.dataType as AnyWgslData),
      this.#dataBuffer,
      this.#indexBuffer,
      this.#options,
    );

    this.#logIdToArgTypes.set(
      id,
      concreteArgs.map((e) =>
        e.dataType === UnknownData
          ? (e.value as string)
          : e.dataType as AnyWgslData
      ),
    );

    return snip(
      stitch`${ctx.resolve(logFn).value}(${nonStringArgs})`,
      Void,
      /* ref */ undefined,
    );
  }

  get logResources(): LogResources | undefined {
    return this.#firstUnusedId === 1 ? undefined : {
      dataBuffer: this.#dataBuffer,
      indexBuffer: this.#indexBuffer,
      options: this.#options,
      logIdToArgTypes: this.#logIdToArgTypes,
    };
  }
}
