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
  logIdToSchema: Map<number, (string | AnyWgslData)[]>;
}

export type LogData = WgslStruct<{
  id: U32;
  data: WgslArray<U32>;
}>;
