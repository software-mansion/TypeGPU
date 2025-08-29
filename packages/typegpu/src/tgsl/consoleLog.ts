import { fn } from '../core/function/tgpuFn.ts';
import type { TgpuRoot } from '../core/root/rootTypes.ts';
import { u32 } from '../data/numeric.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { Void } from '../data/wgslTypes.ts';
import { GenerationCtx } from './generationHelpers.ts';

export interface LogManagerOptions {
  oneLogSize?: number;
  maxLogCount?: number;
}

export interface LogManager {
  registerLog(ctx: GenerationCtx): Snippet;
}

export class LogManagerDummyImpl implements LogManager {
  registerLog(ctx: GenerationCtx): Snippet {
    console.warn(
      "'console.log' is currently only supported in compute pipelines.",
    );
    return snip('/* console.log() */', Void);
  }
}

export class LogManagerImpl implements LogManager {
  #root: TgpuRoot;
  // #options: Required<LogManagerOptions>;
  // #dataSchema: WgslStruct<{
  //   id: U32;
  //   data: WgslArray<U32>;
  // }>;
  // #buffer: TgpuMutable<
  //   WgslArray<
  //     WgslStruct<{
  //       id: U32;
  //       data: WgslArray<U32>;
  //     }>
  //   >
  // >;
  constructor(root: TgpuRoot, options: LogManagerOptions) {
    this.#root = root;

    // if (options?.oneLogSize === undefined) {
    //   options.oneLogSize = 1024;
    // }
    // if (options?.maxLogCount === undefined) {
    //   options.maxLogCount = 256;
    // }
    // this.#options = options as Required<LogManagerOptions>;

    // this.#dataSchema = struct({
    //   id: u32,
    //   data: arrayOf(u32, options.oneLogSize),
    // });
    // this.#buffer = root.createMutable(
    //   arrayOf(this.#dataSchema, options.maxLogCount),
    // );
  }

  registerLog(): Snippet {
    const buffer = this.#root.createMutable(u32);
    const log = fn([])(() => {
      buffer.$ = 1;
    });
    return snip('/* log will be here! */', Void);
  }
}
