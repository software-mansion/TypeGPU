import type { DualFn } from '../data/dualFn.ts';
import { bool } from '../data/index.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { getResolutionCtx, inCodegenMode } from '../execMode.ts';
import { $internal } from '../shared/symbols.ts';
import { type WgslExtension, wgslExtensions } from '../wgslExtensions.ts';

export const extensionEnabled: DualFn<
  (extensionName: WgslExtension) => boolean
> = (() => {
  const jsImpl = (extensionName: WgslExtension) => {
    const resolutionCtx = getResolutionCtx();
    if (!resolutionCtx) {
      throw new Error(
        'extensionEnabled can only be called in a GPU codegen context.',
      );
    }

    return (resolutionCtx.enableExtensions ?? []).includes(extensionName);
  };
  const gpuImpl = (extensionNameSnippet: Snippet) => {
    const { value } = extensionNameSnippet;
    if (
      typeof value !== 'string' ||
      !(wgslExtensions.includes(value as WgslExtension))
    ) {
      throw new Error(
        `extensionEnabled has to be called with a string literal representing a valid WGSL extension name. Got: ${value}`,
      );
    }
    return snip(jsImpl(value as WgslExtension), bool);
  };

  const impl = (extensionName: WgslExtension) => {
    if (inCodegenMode()) {
      return gpuImpl(extensionName as unknown as Snippet);
    }
    throw new Error(
      'extensionEnabled can only be called in a GPU codegen context.',
    );
  };

  Object.defineProperty(impl, $internal, {
    value: {
      jsImpl,
      gpuImpl,
      argConversionHint: 'keep' as const,
    },
  });
  return impl;
})() as unknown as DualFn<
  (extensionName: WgslExtension) => boolean
>;
