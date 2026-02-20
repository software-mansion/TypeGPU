import { comptime } from '../core/function/comptime.ts';
import { getResolutionCtx } from '../execMode.ts';
import { type WgslExtension, wgslExtensions } from '../wgslExtensions.ts';

export const extensionEnabled = comptime(
  (extensionName: WgslExtension): boolean => {
    const resolutionCtx = getResolutionCtx();
    if (!resolutionCtx) {
      throw new Error(
        "Functions using `extensionEnabled` cannot be called directly. Either generate WGSL from them, or use tgpu['~unstable'].simulate(...)",
      );
    }

    if (
      typeof extensionName !== 'string' ||
      !(wgslExtensions.includes(extensionName))
    ) {
      throw new Error(
        `extensionEnabled has to be called with a string literal representing a valid WGSL extension name. Got: '${extensionName}'`,
      );
    }

    return (resolutionCtx.enableExtensions ?? []).includes(extensionName);
  },
);
