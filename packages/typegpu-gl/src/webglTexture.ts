import {
  d,
  type TextureProps,
  type TgpuFixedSampler,
  type TgpuRoot,
  type TgpuTexture,
} from 'typegpu';
import { getName, makeDereferenceable, makeResolvable, setName, snip } from 'typegpu/~internal';
import { getCrossShaderStageState } from './glslGenerator.ts';

type SamplerProps = Parameters<TgpuRoot['createSampler']>[0];
type RawWebGLTexture = NonNullable<ReturnType<WebGL2RenderingContext['createTexture']>>;
type RawWebGLSampler = NonNullable<ReturnType<WebGL2RenderingContext['createSampler']>>;

type TextureFormat = {
  internalFormat: number;
  format: number;
  type: number;
  bytesPerTexel: number;
};

function getFormat(gl: WebGL2RenderingContext, format: GPUTextureFormat): TextureFormat {
  switch (format) {
    case 'r8unorm':
      return {
        internalFormat: gl.R8,
        format: gl.RED,
        type: gl.UNSIGNED_BYTE,
        bytesPerTexel: 1,
      };
    case 'rg8unorm':
      return {
        internalFormat: gl.RG8,
        format: gl.RG,
        type: gl.UNSIGNED_BYTE,
        bytesPerTexel: 2,
      };
    case 'rgba8unorm':
      return {
        internalFormat: gl.RGBA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        bytesPerTexel: 4,
      };
    case 'rgba8unorm-srgb':
      return {
        internalFormat: gl.SRGB8_ALPHA8,
        format: gl.RGBA,
        type: gl.UNSIGNED_BYTE,
        bytesPerTexel: 4,
      };
    case 'rgba16float':
      return {
        internalFormat: gl.RGBA16F,
        format: gl.RGBA,
        type: gl.HALF_FLOAT,
        bytesPerTexel: 8,
      };
    case 'rgba32float':
      return {
        internalFormat: gl.RGBA32F,
        format: gl.RGBA,
        type: gl.FLOAT,
        bytesPerTexel: 16,
      };
    default:
      throw new Error(
        `WebGL fallback does not support texture format '${format}'. Supported formats: r8unorm, rg8unorm, rgba8unorm, rgba8unorm-srgb, rgba16float, rgba32float.`,
      );
  }
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

export class WebGLTextureRenderView {
  readonly resourceType = 'texture-view' as const;
  readonly descriptor: { baseMipLevel?: number };
  readonly texture: WebGLTextureImpl;
  readonly framebuffer: WebGLFramebuffer;

  constructor(texture: WebGLTextureImpl, descriptor: { baseMipLevel?: number } = {}) {
    this.texture = texture;
    this.descriptor = descriptor;
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
      throw new Error('WebGL fallback currently supports only non-multisampled 2D texture views.');
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

  constructor(gl: WebGL2RenderingContext, props: TextureProps) {
    const depth = props.size[2] ?? 1;
    if ((props.dimension ?? '2d') !== '2d' || depth !== 1) {
      throw new Error('WebGL fallback currently supports only 2D textures with one layer.');
    }
    if ((props.sampleCount ?? 1) !== 1) {
      throw new Error('WebGL fallback does not support multisampled textures.');
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
      throw new Error("WebGL fallback does not support the 'storage' texture usage.");
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

  createView(
    schema?: d.WgslTexture2d | 'render',
    descriptor: { baseMipLevel?: number } = {},
  ): WebGLTextureView | WebGLTextureRenderView {
    if (schema === 'render') {
      if (!this.usableAsRender) {
        throw new Error("Texture is not usable as a render target. Add .$usage('render').");
      }
      return new WebGLTextureRenderView(this, descriptor);
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
    if (typeof mipLevelOrOptions !== 'number') {
      throw new Error('WebGL fallback does not support texture.write() options yet.');
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
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.raw);
    this.gl.generateMipmap(this.gl.TEXTURE_2D);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  copyFrom(): never {
    throw new Error('WebGL fallback does not support texture.copyFrom().');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
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
