import { TgpuMutable } from '../../core/buffer/bufferShorthand';
import { AnyWgslData, Atomic, U32, WgslArray, WgslStruct } from '../../data';
import { Snippet } from '../../data/snippet';
import { GenerationCtx } from '../generationHelpers';

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
