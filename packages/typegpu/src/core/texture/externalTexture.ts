import type { TgpuNamable } from '../../namable';
import { identifier } from '../../tgpuIdentifier';
import type { ResolutionCtx } from '../../types';
import type { ExperimentalTgpuRoot } from '../root/rootTypes';

// ----------
// Public API
// ----------

export type ExternalTextureProps = {
  colorSpace: PredefinedColorSpace;
};

export interface TgpuExternalTexture<
  TProps extends ExternalTextureProps = ExternalTextureProps,
> extends TgpuNamable {
  readonly resourceType: 'external-texture';
  readonly props: TProps;
  get source(): HTMLVideoElement | VideoFrame | undefined;
}

export interface TgpuExternalTexture_INTERNAL {
  unwrap(): GPUExternalTexture;
}

export function INTERNAL_createExternalTexture(
  branch: ExperimentalTgpuRoot,
  source: HTMLVideoElement | VideoFrame,
  colorSpace: PredefinedColorSpace | undefined,
) {
  return new TgpuExternalTextureImpl(branch, source, {
    colorSpace: colorSpace ?? 'srgb',
  });
}

export function isExternalTexture<T extends TgpuExternalTexture>(
  value: unknown | T,
): value is T {
  return (value as T)?.resourceType === 'external-texture';
}

// --------------
// Implementation
// --------------

class TgpuExternalTextureImpl
  implements TgpuExternalTexture, TgpuExternalTexture_INTERNAL
{
  private _label: string | undefined;
  public readonly resourceType = 'external-texture';
  /**
   * TODO: Remove when refactoring the resolution ctx
   */
  public readonly type = 'texture_external';

  private _texture: GPUExternalTexture | undefined;

  constructor(
    private readonly _branch: ExperimentalTgpuRoot,
    public readonly source: HTMLVideoElement | VideoFrame,
    public readonly props: ExternalTextureProps,
  ) {}

  get label() {
    return this._label;
  }

  unwrap(): GPUExternalTexture {
    if (!this._texture) {
      this._texture = this._branch.device.importExternalTexture({
        source: this.source,
        colorSpace: this.props.colorSpace,
      });
    }

    return this._texture;
  }

  $name(label: string | undefined): this {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const ident = identifier().$name(this._label);

    ctx.addRenderResource(this, ident);

    return ctx.resolve(ident);
  }
}
