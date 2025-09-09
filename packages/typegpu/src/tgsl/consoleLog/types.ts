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
   * If this number is exceeded, a warning containing the total number of calls is logged.
   * @default 64
   */
  logCountLimit?: number;
  /**
   * The total number of bytes reserved for each log call.
   * If this number is exceeded, an exception is thrown.
   * @default 60
   */
  logSizeLimit?: number;
  /**
   * The prefix attached to each log call.
   * @default "[GPU] "
   */
  messagePrefix?: string;
}

export type SerializedLogCallData = WgslStruct<{
  id: U32;
  serializedData: WgslArray<U32>;
}>;

export interface LogResources {
  logCallIndexBuffer: TgpuMutable<Atomic<U32>>;
  serializedLogDataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>;
  options: Required<LogGeneratorOptions>;
  logIdToArgTypes: Map<number, (string | AnyWgslData)[]>;
}

export interface LogGenerator {
  generateLog(ctx: GenerationCtx, args: Snippet[]): Snippet;
  get logResources(): LogResources | undefined;
}
