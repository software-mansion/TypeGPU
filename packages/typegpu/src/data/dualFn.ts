import type { $internal } from '../shared/symbols.ts';
import type { FnArgsConversionHint } from '../types.ts';
import type { MapValueToSnippet, Snippet } from './snippet.ts';

export type DualFn<TImpl extends (...args: never[]) => unknown> =
  & TImpl
  & {
    readonly [$internal]: {
      jsImpl: TImpl;
      gpuImpl: (...args: MapValueToSnippet<Parameters<TImpl>>) => Snippet;
      argConversionHint: FnArgsConversionHint;
    };
  };
