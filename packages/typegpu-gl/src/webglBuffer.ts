import {
  d,
  patchArrayBuffer,
  readFromArrayBuffer,
  writeToArrayBuffer,
  type BufferInitialData,
  type BufferWriteOptions,
  type TgpuBuffer,
} from 'typegpu';
import { calculateOffsets, getName, setName } from 'typegpu/~internal';

import { WebGLFallbackUnsupportedError } from './errors.ts';
import { WebGLUniformImpl } from './webglUniform.ts';

type UsageLiteral = 'uniform' | 'storage' | 'vertex' | 'index' | 'indirect';

// GPUBufferUsage flags. Spelled out, since WebGPU globals don't exist in browsers without WebGPU.
const BUFFER_USAGE_INDEX = 0x10;
const BUFFER_USAGE_VERTEX = 0x20;
const BUFFER_USAGE_UNIFORM = 0x40;
const BUFFER_USAGE_STORAGE = 0x80;
const BUFFER_USAGE_INDIRECT = 0x100;

/**
 * Everything of `TgpuBuffer` except for the internals, which are WebGPU-specific, and
 * methods that return the buffer itself (typed as a `TgpuBuffer`, internals included).
 */
type PublicTgpuBuffer<TData extends d.AnyData> = Omit<
  TgpuBuffer<TData>,
  symbol | '$name' | '$usage' | '$addFlags' | 'as'
>;

/**
 * A buffer of the WebGL fallback.
 *
 * The GPU never writes into buffers in WebGL 2 (there are no storage buffers), so the
 * data lives in a CPU-side copy, which is uploaded to a GL buffer when a draw uses it.
 * That makes reads and copies between buffers free of any GPU round-trips.
 */
export class WebGLBufferImpl<TData extends d.AnyData> implements PublicTgpuBuffer<TData> {
  readonly resourceType = 'buffer' as const;
  readonly dataType: TData;
  readonly initial: d.InferInput<TData> | undefined;
  /** The CPU-side copy of the data, always up to date */
  readonly arrayBuffer: ArrayBuffer;

  usableAsUniform = false;
  usableAsStorage = false;
  usableAsVertex = false;
  usableAsIndex = false;
  usableAsIndirect = false;

  readonly #gl: WebGL2RenderingContext;
  #raw: WebGLBuffer | null = null;
  #usageHint: number;
  /** The byte range that changed since the last upload, if any */
  #dirty: [start: number, end: number] | undefined;
  #destroyed = false;
  #uniformView: WebGLUniformImpl<d.AnyWgslData> | undefined;

  /**
   * @param usages Applied before `initial`, so that an initializer callback gets a buffer
   *   that already has them.
   */
  constructor(
    gl: WebGL2RenderingContext,
    dataType: TData,
    initial?: BufferInitialData<TData>,
    usages: UsageLiteral[] = [],
  ) {
    this.#gl = gl;
    this.#usageHint = gl.STATIC_DRAW;
    this.dataType = dataType;
    this.arrayBuffer = new ArrayBuffer(d.sizeOf(dataType));
    this.$usage(...usages);

    if (typeof GPUBuffer !== 'undefined' && initial instanceof GPUBuffer) {
      throw new WebGLFallbackUnsupportedError('wrapping a GPUBuffer');
    }
    if (typeof initial === 'function') {
      (initial as (buffer: this) => void)(this);
    } else if (initial !== undefined) {
      this.initial = initial as d.InferInput<TData>;
      this.write(this.initial);
    }
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  get buffer(): never {
    throw new WebGLFallbackUnsupportedError(
      'buffer.buffer',
      'buffers of the WebGL fallback are not backed by a GPUBuffer',
    );
  }

  $name(label: string): this {
    setName(this, label);
    return this;
  }

  $usage(...usages: UsageLiteral[]): this {
    for (const usage of usages) {
      if (usage === 'storage' || usage === 'indirect') {
        throw new WebGLFallbackUnsupportedError(`${usage} buffer usage`);
      }
      this.usableAsUniform ||= usage === 'uniform';
      this.usableAsVertex ||= usage === 'vertex';
      this.usableAsIndex ||= usage === 'index';
    }

    // WebGL 2 decides whether a buffer holds indices or other data the first time it's
    // bound, and never lets it be bound to the other kind of target afterwards (unlike
    // WebGPU, which allows VERTEX | INDEX). Uniforms don't use GL buffers, so they
    // don't count.
    if (this.usableAsVertex && this.usableAsIndex) {
      throw new WebGLFallbackUnsupportedError(
        'buffers with both vertex and index usage',
        'WebGL 2 does not allow binding a buffer as both vertex and index data, so create a separate buffer for each',
      );
    }
    return this;
  }

  /**
   * The fallback keeps a CPU-side copy of every buffer, which covers what the
   * MAP_READ/MAP_WRITE/COPY_SRC/COPY_DST flags would be needed for.
   * Flags that correspond to usages are applied like `$usage` would.
   */
  $addFlags(flags: GPUBufferUsageFlags): this {
    if (flags & BUFFER_USAGE_STORAGE) this.$usage('storage');
    if (flags & BUFFER_USAGE_INDIRECT) this.$usage('indirect');
    if (flags & BUFFER_USAGE_UNIFORM) this.$usage('uniform');
    if (flags & BUFFER_USAGE_VERTEX) this.$usage('vertex');
    if (flags & BUFFER_USAGE_INDEX) this.$usage('index');
    return this;
  }

  /**
   * Uniforms of the fallback are uploaded with `gl.uniform*()` calls from the buffer's
   * CPU-side copy, so the buffer doesn't need a GL buffer for them.
   */
  as(
    usage: 'uniform' | 'readonly' | 'mutable',
  ): TData extends d.AnyWgslData ? WebGLUniformImpl<TData> : never {
    if (usage !== 'uniform') {
      throw new WebGLFallbackUnsupportedError(`buffer.as("${usage}")`);
    }
    if (!this.usableAsUniform) {
      throw new Error("Buffer is not usable as a uniform. Add .$usage('uniform').");
    }
    this.#uniformView ??= new WebGLUniformImpl(this as unknown as WebGLBufferImpl<d.AnyWgslData>);
    return this.#uniformView as TData extends d.AnyWgslData ? WebGLUniformImpl<TData> : never;
  }

  compileWriter(): void {
    // Writing is done on the CPU with TypeGPU's shared writers, nothing to prepare
  }

  write(data: d.InferInput<TData> | ArrayBuffer, options?: BufferWriteOptions): void {
    this.#assertNotDestroyed();
    // Skipping the copy if the data was written straight into `arrayBuffer`
    if (data !== this.arrayBuffer) {
      writeToArrayBuffer(this.arrayBuffer, this.dataType, data, options);
    }
    const { startOffset, endOffset } = calculateOffsets(options, this.dataType, data);
    this.#markDirty(startOffset, endOffset);
  }

  /** @deprecated Use {@link patch} instead. */
  writePartial(_data: unknown): void {
    throw new WebGLFallbackUnsupportedError('buffer.writePartial()', 'use buffer.patch() instead');
  }

  patch(data: d.InferPatch<TData>): void {
    this.#assertNotDestroyed();
    patchArrayBuffer(this.arrayBuffer, this.dataType, data);
    this.#markDirty(0, this.arrayBuffer.byteLength);
  }

  clear(encoder?: unknown): void {
    if (encoder !== undefined) {
      throw new WebGLFallbackUnsupportedError('command encoders');
    }
    this.#assertNotDestroyed();
    new Uint8Array(this.arrayBuffer).fill(0);
    this.#markDirty(0, this.arrayBuffer.byteLength);
  }

  copyFrom(srcBuffer: TgpuBuffer<d.MemIdentity<TData>>, encoder?: unknown): void {
    if (encoder !== undefined) {
      throw new WebGLFallbackUnsupportedError('command encoders');
    }
    if (!(srcBuffer instanceof WebGLBufferImpl)) {
      throw new Error('Expected a buffer created by the WebGL root.');
    }
    this.#assertNotDestroyed();
    srcBuffer.#assertNotDestroyed();
    const size = Math.min(this.arrayBuffer.byteLength, srcBuffer.arrayBuffer.byteLength);
    new Uint8Array(this.arrayBuffer).set(new Uint8Array(srcBuffer.arrayBuffer, 0, size));
    this.#markDirty(0, size);
  }

  read(): Promise<d.Infer<TData>> {
    this.#assertNotDestroyed();
    return Promise.resolve(readFromArrayBuffer(this.arrayBuffer, this.dataType));
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    if (this.#raw) {
      this.#gl.deleteBuffer(this.#raw);
      this.#raw = null;
    }
  }

  toString(): string {
    return `buffer:${getName(this) ?? '<unnamed>'}`;
  }

  #assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error('This buffer has been destroyed');
    }
  }

  #markDirty(start: number, end: number): void {
    if (end <= start) return;
    this.#dirty = this.#dirty
      ? [Math.min(this.#dirty[0], start), Math.max(this.#dirty[1], end)]
      : [start, end];
  }

  /**
   * Binds the GL buffer to the target matching its usage (`ARRAY_BUFFER` or
   * `ELEMENT_ARRAY_BUFFER`), uploading whatever changed since the last time.
   *
   * Binding to `ELEMENT_ARRAY_BUFFER` changes the bound VAO, so this should be called
   * with no VAO bound.
   */
  sync(): WebGLBuffer {
    this.#assertNotDestroyed();

    const gl = this.#gl;
    const target = this.usableAsIndex ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;

    if (!this.#raw) {
      const raw = gl.createBuffer();
      if (!raw) throw new Error('Failed to create WebGL buffer');
      this.#raw = raw;
      gl.bindBuffer(target, raw);
      // Allocates and uploads the initial contents at once
      gl.bufferData(target, new Uint8Array(this.arrayBuffer), this.#usageHint);
      this.#dirty = undefined;
      return raw;
    }

    gl.bindBuffer(target, this.#raw);
    if (!this.#dirty) {
      return this.#raw;
    }

    if (this.#usageHint === gl.STATIC_DRAW) {
      // The buffer changed after its first use, so it's likely to change again. Its
      // storage is reallocated once with a hint that fits that better.
      this.#usageHint = gl.DYNAMIC_DRAW;
      gl.bufferData(target, new Uint8Array(this.arrayBuffer), this.#usageHint);
    } else {
      const [start, end] = this.#dirty;
      gl.bufferSubData(target, start, new Uint8Array(this.arrayBuffer, start, end - start));
    }
    this.#dirty = undefined;
    return this.#raw;
  }
}
