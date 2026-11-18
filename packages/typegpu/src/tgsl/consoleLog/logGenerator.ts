import type { TgpuMutable } from '../../core/buffer/bufferBinding.ts';
import { stitch } from '../../core/resolve/stitch.ts';
import type { TgpuRoot } from '../../core/root/rootTypes.ts';
import { shaderStageSlot } from '../../core/slot/internalSlots.ts';
import { arrayOf } from '../../data/array.ts';
import { atomic } from '../../data/atomic.ts';
import { UnknownData, unptr } from '../../data/dataTypes.ts';
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
import { invariant } from '../../errors.ts';
import type { ResolutionCtx } from '../../internal.ts';
import { $internal } from '../../shared/symbols.ts';
import { logger } from '../../tgpuLogger.ts';
import { convertToCommonType } from '../conversion.ts';
import { concretizeSnippet } from '../generationHelpers.ts';
import { createLoggingFunction } from './serializers.ts';
import {
  type LogGenerator,
  type LogGeneratorOptions,
  type LogMeta,
  type LogResources,
  type SerializedLogCallData,
  type SupportedLogOp,
} from './types.ts';

const defaultOptions: Required<LogGeneratorOptions> = {
  logCountLimit: 64,
  logSizeLimit: 252,
  messagePrefix: ' GPU ',
};

const fallbackSnippet = snip('/* console.log() */', Void, /* origin */ 'runtime');

export class LogGeneratorNullImpl implements LogGenerator {
  get logResources(): undefined {
    return undefined;
  }
  generateLog(): Snippet {
    logger.warn('fallback', "'console.log' is only supported when resolving pipelines.");
    return fallbackSnippet;
  }
}

export class LogGeneratorImpl implements LogGenerator {
  #options: Required<LogGeneratorOptions>;
  #logIdToMeta: Map<number, LogMeta>;
  #firstUnusedId = 1;
  #root: TgpuRoot;
  #buffers:
    | {
        indexBuffer: TgpuMutable<Atomic<U32>>;
        dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>;
      }
    | undefined;

  constructor(root: TgpuRoot) {
    this.#root = root;
    this.#options = { ...defaultOptions, ...root[$internal].logOptions };
    this.#logIdToMeta = new Map();
  }

  /**
   * Created on first use, so that resolving code without any logs doesn't allocate
   * buffers (and works where WebGPU globals aren't available, e.g. in @typegpu/gl).
   */
  #getBuffers() {
    if (!this.#buffers) {
      const SerializedLogData = struct({
        id: u32,
        serializedData: arrayOf(u32, Math.ceil(this.#options.logSizeLimit / 4)),
      }).$name('SerializedLogData');

      this.#buffers = {
        dataBuffer: this.#root
          .createMutable(arrayOf(SerializedLogData, this.#options.logCountLimit))
          .$name('dataBuffer'),
        indexBuffer: this.#root.createMutable(atomic(u32)).$name('indexBuffer'),
      };
    }
    return this.#buffers;
  }

  /**
   * Generates all necessary resources for serializing arguments for logging purposes.
   *
   * @param ctx Resolution context.
   * @param args Argument snippets. Snippets of UnknownType will be treated as string literals.
   * @returns A snippet containing the call to the logging function.
   */
  generateLog(ctx: ResolutionCtx, op: SupportedLogOp, args: Snippet[]): Snippet {
    if (shaderStageSlot.$ === 'vertex') {
      logger.warn('suspicious', `'console' operations are not supported in vertex shaders.`);
      return fallbackSnippet;
    }

    const id = this.#firstUnusedId++;

    const concreteArgsWithStrings = args
      .map((arg) => {
        if (arg.dataType === UnknownData) {
          return arg;
        }
        const converted = convertToCommonType(ctx, [arg], [unptr(arg.dataType)])?.[0];
        invariant(
          converted,
          `Internal error. Expected type ${arg.dataType} to be convertible to ${unptr(arg.dataType)}`,
        );
        return converted;
      })
      .map(concretizeSnippet);

    const concreteArgs = concreteArgsWithStrings.filter((arg) => arg.dataType !== UnknownData);

    const { dataBuffer, indexBuffer } = this.#getBuffers();
    const logFn = createLoggingFunction(
      id,
      concreteArgs.map((e) => e.dataType as AnyWgslData),
      dataBuffer,
      indexBuffer,
      this.#options,
    );

    const functionSnippet = snip(
      stitch`${ctx.resolve(logFn).value}(${concreteArgs})`,
      Void,
      /* origin */ 'runtime',
    );

    this.#logIdToMeta.set(id, {
      op,
      argTypes: concreteArgsWithStrings.map((e) =>
        e?.dataType === UnknownData ? (e?.value as string) : (e?.dataType as AnyWgslData),
      ),
    });

    return functionSnippet;
  }

  get logResources(): LogResources | undefined {
    return this.#firstUnusedId === 1
      ? undefined
      : {
          ...this.#getBuffers(),
          options: this.#options,
          logIdToMeta: this.#logIdToMeta,
        };
  }
}
