import type { TgpuNamable } from '../../namable';
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

export interface INTERNAL_TgpuExternalTexture {
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
  implements TgpuExternalTexture, INTERNAL_TgpuExternalTexture
{
  public readonly resourceType = 'external-texture';
  /**
   * TODO: Remove when refactoring the resolution ctx
   */
  public readonly type = 'texture_external';

  private _label: string | undefined;
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
    const id = ctx.names.makeUnique(this._label);
    ctx.addRenderResource(this, id);
    return id;
  }
}
