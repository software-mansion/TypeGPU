import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import type { Snippet } from '../../data/snippet.ts';
import type {
  AnyWgslData,
  Atomic,
  U32,
  WgslArray,
  WgslStruct,
} from '../../data/wgslTypes.ts';
import type { GenerationCtx } from '../generationHelpers.ts';

/**
 * Options for configuring GPU log generation.
 */
export interface LogGeneratorOptions {
  /**
   * The maximum number of logs that appear during a single draw/dispatch call.
   * If this number is exceeded, a warning containing the total number of calls is logged and further logs are dropped.
   * @default 64
   */
  logCountLimit?: number;
  /**
   * The total number of bytes reserved for each log call.
   * If this number is exceeded, an exception is thrown during resolution.
   * @default 252
   */
  logSizeLimit?: number;
  /**
   * The prefix attached to each log call.
   * @default "%c GPU %c "
   */
  messagePrefix?: string;
}

export type SerializedLogCallData = WgslStruct<{
  id: U32;
  serializedData: WgslArray<U32>;
}>;

export interface LogMeta {
  op: keyof typeof console;
  argTypes: (string | AnyWgslData)[];
}

/**
 * The resources required for logging within the TGSL console.
 *
 * @property indexBuffer - A buffer used for indexing log entries. Needs to be cleared after each dispatch/draw.
 * @property dataBuffer - A buffer containing an array of serialized log call data.
 * @property options - The configuration options for the LogGenerator.
 * @property logIdToArgTypes - A mapping from log identifiers to their corresponding argument types.
 * @property logIdToMeta - A mapping from log identifiers to an object containing the corresponding log op and argument types.
 */
export interface LogResources {
  indexBuffer: TgpuMutable<Atomic<U32>>;
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>;
  options: Required<LogGeneratorOptions>;
  logIdToArgTypes: Map<number, (string | AnyWgslData)[]>;
  logIdToMeta: Map<number, LogMeta>;
}

export interface LogGenerator {
  generateLog(
    ctx: GenerationCtx,
    op: keyof typeof console,
    args: Snippet[],
  ): Snippet;
  get logResources(): LogResources | undefined;
}

export const supportedLogOps: Set<keyof typeof console> = new Set([
  'log',
  'debug',
  'info',
  'warn',
  'error',
  'clear',
]);
