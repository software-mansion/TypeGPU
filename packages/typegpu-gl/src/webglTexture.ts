import {
  d,
  type TextureProps,
  type TgpuFixedSampler,
  type TgpuRoot,
  type TgpuTexture,
} from 'typegpu';
import { getName, makeDereferenceable, makeResolvable, setName, snip } from 'typegpu/~internal';
import { WebGLFallbackUnsupportedError } from './errors.ts';
import { getCrossShaderStageState } from './glslGenerator.ts';

type SamplerProps = Parameters<TgpuRoot['createSampler']>[0];
type RawWebGLTexture = NonNullable<ReturnType<WebGL2RenderingContext['createTexture']>>;
type RawWebGLSampler = NonNullable<ReturnType<WebGL2RenderingContext['createSampler']>>;

type TextureFormat = {
  internalFormat: number;
  format: number;
  type: number;
  bytesPerTexel: number;
  aspect: 'color' | 'depth' | 'depth-stencil';
};

function color(
  internalFormat: number,
  format: number,
  type: number,
  bytesPerTexel: number,
): TextureFormat {
  return { internalFormat, format, type, bytesPerTexel, aspect: 'color' };
}

function formatTable(gl: WebGL2RenderingContext): Partial<Record<GPUTextureFormat, TextureFormat>> {
  return {
    r8unorm: color(gl.R8, gl.RED, gl.UNSIGNED_BYTE, 1),
    rg8unorm: color(gl.RG8, gl.RG, gl.UNSIGNED_BYTE, 2),
    rgba8unorm: color(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 4),
    'rgba8unorm-srgb': color(gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, 4),
    rgba16float: color(gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, 8),
    rgba32float: color(gl.RGBA32F, gl.RGBA, gl.FLOAT, 16),
    depth16unorm: {
      internalFormat: gl.DEPTH_COMPONENT16,
      format: gl.DEPTH_COMPONENT,
      type: gl.UNSIGNED_SHORT,
      bytesPerTexel: 2,
      aspect: 'depth',
    },
    depth24plus: {
      internalFormat: gl.DEPTH_COMPONENT24,
      format: gl.DEPTH_COMPONENT,
      type: gl.UNSIGNED_INT,
      bytesPerTexel: 4,
      aspect: 'depth',
    },
    'depth24plus-stencil8': {
      internalFormat: gl.DEPTH24_STENCIL8,
      format: gl.DEPTH_STENCIL,
      type: gl.UNSIGNED_INT_24_8,
      bytesPerTexel: 4,
      aspect: 'depth-stencil',
    },
    depth32float: {
      internalFormat: gl.DEPTH_COMPONENT32F,
      format: gl.DEPTH_COMPONENT,
      type: gl.FLOAT,
      bytesPerTexel: 4,
      aspect: 'depth',
    },
    'depth32float-stencil8': {
      internalFormat: gl.DEPTH32F_STENCIL8,
      format: gl.DEPTH_STENCIL,
      type: gl.FLOAT_32_UNSIGNED_INT_24_8_REV,
      bytesPerTexel: 8,
      aspect: 'depth-stencil',
    },
  };
}

function getFormat(gl: WebGL2RenderingContext, format: GPUTextureFormat): TextureFormat {
  const table = formatTable(gl);
  const result = table[format];
  if (!result) {
    throw new WebGLFallbackUnsupportedError(
      `texture format ${format}`,
      `supported formats: ${Object.keys(table).join(', ')}`,
    );
  }
  return result;
}

function addressMode(gl: WebGL2RenderingContext, mode: GPUAddressMode | undefined): number {
  if (mode === 'repeat') return gl.REPEAT;
  if (mode === 'mirror-repeat') return gl.MIRRORED_REPEAT;
  return gl.CLAMP_TO_EDGE;
}

function filterMode(gl: WebGL2RenderingContext, mode: GPUFilterMode | undefined): number {
  return mode === 'linear' ? gl.LINEAR : gl.NEAREST;
}

function minFilterMode(gl: WebGL2RenderingContext, props: SamplerProps): number {
  if (props.mipmapFilter === 'linear') {
    return props.minFilter === 'linear' ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_LINEAR;
  }
  if (props.mipmapFilter === 'nearest') {
    return props.minFilter === 'linear' ? gl.LINEAR_MIPMAP_NEAREST : gl.NEAREST_MIPMAP_NEAREST;
  }
  return filterMode(gl, props.minFilter);
}

let nextRenderViewId = 0;

export class WebGLTextureRenderView {
  readonly resourceType = 'texture-view' as const;
  /** Identifies the view in framebuffer cache keys */
  readonly id = nextRenderViewId++;
  readonly descriptor: { baseMipLevel?: number };
  readonly texture: WebGLTextureImpl;
  /**
   * A framebuffer with just this view as its only color attachment.
   * Depth textures are attached to other framebuffers, so they don't have one.
   */
  readonly framebuffer: WebGLFramebuffer | null;

  constructor(texture: WebGLTextureImpl, descriptor: { baseMipLevel?: number } = {}) {
    this.texture = texture;
    this.descriptor = descriptor;
    if (texture.format.aspect !== 'color') {
      this.framebuffer = null;
      return;
    }

    const framebuffer = texture.gl.createFramebuffer();
    if (!framebuffer) throw new Error('Failed to create WebGL framebuffer');
    this.framebuffer = framebuffer;

    const gl = texture.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture.raw,
      descriptor.baseMipLevel ?? 0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      throw new Error(
        `Texture format '${texture.props.format}' is not renderable by this WebGL 2 implementation.`,
      );
    }
    texture.registerFramebuffer(framebuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  get size(): readonly [number, number] {
    const scale = 2 ** (this.descriptor.baseMipLevel ?? 0);
    return [
      Math.max(1, Math.floor(this.texture.width / scale)),
      Math.max(1, Math.floor(this.texture.height / scale)),
    ];
  }
}

export class WebGLTextureView {
  readonly resourceType = 'texture-view' as const;
  readonly texture: WebGLTextureImpl;
  readonly schema: d.WgslTexture2d;
  readonly descriptor: { baseMipLevel?: number };

  declare readonly $: d.texture2d;

  static {
    makeDereferenceable(
      makeResolvable(WebGLTextureView.prototype, {
        resolve(ctx) {
          const state = getCrossShaderStageState(ctx);
          let id = state.globalIdentifierMap.get(this);
          if (!id) {
            id = ctx.makeUniqueIdentifier(getName(this), 'global');
            state.globalIdentifierMap.set(this, id);
          }

          const { group, binding } = ctx.allocateFixedEntry(
            {
              texture: this.schema,
              sampleType: this.schema.bindingSampleType[0],
            },
            this,
          );
          return ctx.gen.declareGlobalVar({
            group,
            binding,
            id,
            dataType: this.schema,
            scope: 'handle',
            init: undefined,
          });
        },
        asString() {
          return `textureView:${getName(this) ?? '<unnamed>'}`;
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(trackingProxy, this.schema, 'handle', false);
          },
        },
        normalMode: {
          get() {
            throw new Error('Direct access to texture views is only possible inside GPU code.');
          },
        },
      },
    );
  }

  constructor(
    texture: WebGLTextureImpl,
    schema: d.WgslTexture2d = d.texture2d(d.f32),
    descriptor: { baseMipLevel?: number } = {},
  ) {
    if (schema.type !== 'texture_2d' || schema.multisampled) {
      throw new WebGLFallbackUnsupportedError(
        schema.multisampled ? 'multisampled texture views' : `${schema.type} texture views`,
        'only non-multisampled 2D texture views are supported',
      );
    }
    this.texture = texture;
    this.schema = schema;
    this.descriptor = descriptor;
  }

  get size(): number[] {
    const scale = 2 ** (this.descriptor.baseMipLevel ?? 0);
    return [
      Math.max(1, Math.floor(this.texture.width / scale)),
      Math.max(1, Math.floor(this.texture.height / scale)),
    ];
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }
}

export class WebGLTextureImpl {
  readonly resourceType = 'texture' as const;
  readonly gl: WebGL2RenderingContext;
  readonly props: TextureProps;
  readonly raw: RawWebGLTexture;
  readonly format: TextureFormat;
  readonly width: number;
  readonly height: number;
  usableAsSampled = false;
  usableAsStorage = false;
  usableAsRender = false;
  needsYFlipWhenSampling = false;
  destroyed = false;
  readonly #framebuffers = new Set<WebGLFramebuffer>();
  readonly #destroyCallbacks = new Set<() => void>();
  readonly #renderViews = new Map<number, WebGLTextureRenderView>();

  constructor(gl: WebGL2RenderingContext, props: TextureProps) {
    const depth = props.size[2] ?? 1;
    if ((props.dimension ?? '2d') !== '2d' || depth !== 1) {
      throw new WebGLFallbackUnsupportedError(
        'non-2D or layered textures',
        'only 2D textures with one layer are supported',
      );
    }
    if ((props.sampleCount ?? 1) !== 1) {
      throw new WebGLFallbackUnsupportedError('multisampled textures');
    }

    this.gl = gl;
    this.props = props;
    this.width = props.size[0] ?? 1;
    this.height = props.size[1] ?? 1;
    this.format = getFormat(gl, props.format);

    const raw = gl.createTexture();
    if (!raw) throw new Error('Failed to create WebGL texture');
    this.raw = raw;

    gl.bindTexture(gl.TEXTURE_2D, raw);
    gl.texStorage2D(
      gl.TEXTURE_2D,
      props.mipLevelCount ?? 1,
      this.format.internalFormat,
      this.width,
      this.height,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }

  $usage(...usages: ('sampled' | 'storage' | 'render' | 'transient')[]): this {
    if (usages.includes('storage')) {
      throw new WebGLFallbackUnsupportedError('storage texture usage');
    }
    this.usableAsSampled ||= usages.includes('sampled');
    this.usableAsRender ||= usages.includes('render') || usages.includes('transient');
    return this;
  }

  $overrideFlags(_flags: GPUTextureUsageFlags): this {
    this.usableAsSampled = true;
    this.usableAsRender = true;
    return this;
  }

  registerFramebuffer(framebuffer: WebGLFramebuffer): void {
    this.#framebuffers.add(framebuffer);
  }

  /**
   * Registers a callback to release GL objects that reference this texture.
   */
  onDestroy(callback: () => void): void {
    this.#destroyCallbacks.add(callback);
  }

  /**
   * The view used when the texture itself is passed as an attachment.
   */
  get renderView(): WebGLTextureRenderView {
    if (!this.usableAsRender) {
      throw new Error("Texture is not usable as a render target. Add .$usage('render').");
    }
    return this.#renderViewAt(0);
  }

  /**
   * Render views are cached per mip level, so that creating one every frame doesn't create
   * new framebuffers (and implicit depth buffers) every frame.
   */
  #renderViewAt(baseMipLevel: number): WebGLTextureRenderView {
    let view = this.#renderViews.get(baseMipLevel);
    if (!view) {
      view = new WebGLTextureRenderView(this, { baseMipLevel });
      this.#renderViews.set(baseMipLevel, view);
    }
    return view;
  }

  createView(
    schema?: d.WgslTexture2d | 'render',
    descriptor: { baseMipLevel?: number } = {},
  ): WebGLTextureView | WebGLTextureRenderView {
    if (schema === 'render') {
      if (!this.usableAsRender) {
        throw new Error("Texture is not usable as a render target. Add .$usage('render').");
      }
      return this.#renderViewAt(descriptor.baseMipLevel ?? 0);
    }
    if (!this.usableAsSampled) {
      throw new Error("Texture is not sampleable. Add .$usage('sampled').");
    }
    return new WebGLTextureView(this, schema ?? d.texture2d(d.f32), descriptor);
  }

  write(
    source: ArrayBuffer | ArrayBufferView | TexImageSource,
    mipLevelOrOptions: number | { fit?: 'stretch' } = 0,
  ): void {
    const gl = this.gl;
    if (this.format.aspect !== 'color') {
      throw new WebGLFallbackUnsupportedError(
        'writing to depth textures',
        'WebGL 2 can only fill them by rendering',
      );
    }
    if (typeof mipLevelOrOptions !== 'number') {
      throw new WebGLFallbackUnsupportedError('texture.write() options');
    }
    const level = mipLevelOrOptions;
    const width = Math.max(1, this.width >> level);
    const height = Math.max(1, this.height >> level);
    gl.bindTexture(gl.TEXTURE_2D, this.raw);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
      if (source.byteLength !== width * height * this.format.bytesPerTexel) {
        throw new Error(
          `Buffer size mismatch. Expected ${width * height * this.format.bytesPerTexel} bytes for mip level ${level}, got ${source.byteLength} bytes.`,
        );
      }
      const buffer = source instanceof ArrayBuffer ? source : source.buffer;
      const byteOffset = source instanceof ArrayBuffer ? 0 : source.byteOffset;
      const byteLength = source.byteLength;
      const pixels =
        this.format.type === gl.FLOAT
          ? new Float32Array(buffer, byteOffset, byteLength / 4)
          : this.format.type === gl.HALF_FLOAT
            ? new Uint16Array(buffer, byteOffset, byteLength / 2)
            : new Uint8Array(buffer, byteOffset, byteLength);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        level,
        0,
        0,
        width,
        height,
        this.format.format,
        this.format.type,
        pixels as ArrayBufferView,
      );
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, level, 0, 0, this.format.format, this.format.type, source);
    }
    this.needsYFlipWhenSampling = false;
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  clear(mipLevel: number | 'all' = 'all'): void {
    if (this.format.aspect !== 'color') {
      throw new WebGLFallbackUnsupportedError(
        'clearing depth textures with texture.clear()',
        "use depthLoadOp: 'clear' instead",
      );
    }
    const first = mipLevel === 'all' ? 0 : mipLevel;
    const end = mipLevel === 'all' ? (this.props.mipLevelCount ?? 1) : mipLevel + 1;
    for (let level = first; level < end; level++) {
      const width = Math.max(1, this.width >> level);
      const height = Math.max(1, this.height >> level);
      this.write(new Uint8Array(width * height * this.format.bytesPerTexel), level);
    }
  }

  generateMipmaps(): void {
    if (!this.usableAsRender) {
      throw new Error("generateMipmaps requires .$usage('render').");
    }
    if (this.format.aspect !== 'color') {
      throw new WebGLFallbackUnsupportedError('generating mipmaps of depth textures');
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.raw);
    this.gl.generateMipmap(this.gl.TEXTURE_2D);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  copyFrom(): never {
    throw new WebGLFallbackUnsupportedError('texture.copyFrom()');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const callback of this.#destroyCallbacks) {
      callback();
    }
    this.#destroyCallbacks.clear();
    for (const framebuffer of this.#framebuffers) {
      this.gl.deleteFramebuffer(framebuffer);
    }
    this.#framebuffers.clear();
    this.gl.deleteTexture(this.raw);
  }
}

export class WebGLSamplerImpl {
  readonly resourceType = 'sampler' as const;
  readonly schema = d.sampler();
  readonly props: SamplerProps;
  readonly raw: RawWebGLSampler;

  declare readonly $: d.sampler;

  static {
    makeDereferenceable(
      makeResolvable(WebGLSamplerImpl.prototype, {
        resolve(ctx) {
          const state = getCrossShaderStageState(ctx);
          let id = state.globalIdentifierMap.get(this);
          if (!id) {
            id = ctx.makeUniqueIdentifier(getName(this), 'global');
            state.globalIdentifierMap.set(this, id);
          }
          const { group, binding } = ctx.allocateFixedEntry({ sampler: 'filtering' }, this);
          return ctx.gen.declareGlobalVar({
            group,
            binding,
            id,
            dataType: this.schema,
            scope: 'handle',
            init: undefined,
          });
        },
        asString() {
          return `sampler:${getName(this) ?? '<unnamed>'}`;
        },
      }),
      {
        codegenMode: {
          getBaseSnippet(trackingProxy) {
            return snip(trackingProxy, this.schema, 'handle', false);
          },
        },
        normalMode: {
          get() {
            throw new Error('Direct access to samplers is only possible inside GPU code.');
          },
        },
      },
    );
  }

  constructor(gl: WebGL2RenderingContext, props: SamplerProps) {
    this.props = props;
    const sampler = gl.createSampler();
    if (!sampler) throw new Error('Failed to create WebGL sampler');
    this.raw = sampler;
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, addressMode(gl, props.addressModeU));
    gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, addressMode(gl, props.addressModeV));
    gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filterMode(gl, props.magFilter));
    gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, minFilterMode(gl, props));
    if (props.lodMinClamp !== undefined) {
      gl.samplerParameterf(sampler, gl.TEXTURE_MIN_LOD, props.lodMinClamp);
    }
    if (props.lodMaxClamp !== undefined) {
      gl.samplerParameterf(sampler, gl.TEXTURE_MAX_LOD, props.lodMaxClamp);
    }
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }
}

export function asTgpuTexture<TProps extends TextureProps>(texture: WebGLTextureImpl) {
  return texture as unknown as TgpuTexture<TProps>;
}

export function asTgpuSampler(sampler: WebGLSamplerImpl) {
  return sampler as unknown as TgpuFixedSampler;
}
