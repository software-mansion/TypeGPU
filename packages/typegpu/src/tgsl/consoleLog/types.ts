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
  serializedLogDataSizeLimit?: number;
  logCountPerDispatchLimit?: number;
}

export type SerializedLogCallData = WgslStruct<{
  id: U32;
  serializedData: WgslArray<U32>;
}>;

export interface LogResources {
  dataIndexBuffer: TgpuMutable<Atomic<U32>>;
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>;
  options: Required<LogManagerOptions>;
  logIdToArgTypes: Map<number, (string | AnyWgslData)[]>;
}

export interface LogManager {
  registerLog(ctx: GenerationCtx, args: Snippet[]): Snippet;
  get logResources(): LogResources | undefined;
}
