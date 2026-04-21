import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import type { Snippet } from '../../data/snippet.ts';
import type { AnyWgslData, Atomic, U32, WgslArray, WgslStruct } from '../../data/wgslTypes.ts';
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
   * @default ' GPU '
   */
  messagePrefix?: string;
}

export type SerializedLogCallData = WgslStruct<{
  id: U32;
  serializedData: WgslArray<U32>;
}>;

export interface LogMeta {
  op: SupportedLogOps;
  argTypes: (string | AnyWgslData)[];
}

/**
 * The resources required for logging via console.log within TypeGPU functions.
 *
 * @property indexBuffer - A buffer used for indexing log entries. Needs to be cleared after each dispatch/draw.
 * @property dataBuffer - A buffer containing an array of serialized log call data.
 * @property options - The configuration options for the LogGenerator.
 * @property logIdToMeta - A mapping from log identifiers to an object containing the corresponding log op and argument types.
 */
export interface LogResources {
  indexBuffer: TgpuMutable<Atomic<U32>>;
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>;
  options: Required<LogGeneratorOptions>;
  logIdToMeta: Map<number, LogMeta>;
}

export interface LogGenerator {
  generateLog(ctx: GenerationCtx, op: string, args: Snippet[]): Snippet;
  get logResources(): LogResources | undefined;
}

export const supportedLogOps = ['log', 'debug', 'info', 'warn', 'error', 'clear'] as const;

export type SupportedLogOps = (typeof supportedLogOps)[number];
