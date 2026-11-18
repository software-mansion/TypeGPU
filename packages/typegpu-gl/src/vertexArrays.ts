import type { TgpuVertexLayout } from 'typegpu';

import type { VertexFormatInfo } from './vertexFormats.ts';
import type { WebGLBufferImpl } from './webglBuffer.ts';

export interface VertexAttribute {
  /** The attribute location in the vertex shader */
  readonly location: number;
  readonly layout: TgpuVertexLayout;
  /** Byte offset of the attribute within an element of the layout */
  readonly offset: number;
  readonly format: VertexFormatInfo;
}

type AnyBuffer = WebGLBufferImpl<never>;

interface CachedVertexArray {
  readonly vao: WebGLVertexArrayObject;
  /** Unregisters the release callback from every buffer the VAO uses */
  readonly unsubscribe: readonly (() => void)[];
}

/**
 * Creates and caches vertex array objects (VAOs), one for every combination of a
 * pipeline's attributes and the buffers bound to them, so that attributes are set up
 * once, instead of on every draw.
 */
export class VertexArrays {
  readonly #gl: WebGL2RenderingContext;
  readonly #vaos = new Map<string, CachedVertexArray>();

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
  }

  /**
   * @param ownerId Identifies the attribute setup, e.g. a pipeline.
   * @param vertexBuffers The buffer bound to each layout of `attributes`.
   */
  vertexArrayFor(
    ownerId: number,
    attributes: readonly VertexAttribute[],
    vertexBuffers: ReadonlyMap<TgpuVertexLayout, AnyBuffer>,
    indexBuffer: AnyBuffer | undefined,
  ): WebGLVertexArrayObject {
    const buffers = attributes.map((attribute) => vertexBuffers.get(attribute.layout) as AnyBuffer);
    // Without attributes, VAOs only differ in their index buffer
    const key =
      attributes.length === 0
        ? `-|${indexBuffer?.id ?? '-'}`
        : `${ownerId}|${buffers.map((buffer) => buffer.id).join(',')}|${indexBuffer?.id ?? '-'}`;

    const cached = this.#vaos.get(key);
    if (cached) {
      return cached.vao;
    }

    const gl = this.#gl;
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    gl.bindVertexArray(vao);

    attributes.forEach((attribute, i) => {
      const buffer = buffers[i] as AnyBuffer;
      const { location, layout, offset, format } = attribute;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.sync());
      gl.enableVertexAttribArray(location);
      if (format.integer) {
        gl.vertexAttribIPointer(location, format.size, gl[format.type], layout.stride, offset);
      } else {
        gl.vertexAttribPointer(
          location,
          format.size,
          gl[format.type],
          format.normalized,
          layout.stride,
          offset,
        );
      }
      gl.vertexAttribDivisor(location, layout.stepMode === 'instance' ? 1 : 0);
    });
    if (indexBuffer) {
      // The index buffer binding is part of the VAO's state
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.sync());
    }
    gl.bindVertexArray(null);

    // Destroying any of the buffers releases the VAO. The callback is then removed from
    // the others too, so that long-lived buffers (e.g. vertices paired with index buffers
    // that get recreated) don't keep collecting stale callbacks.
    const release = () => {
      const entry = this.#vaos.get(key);
      if (entry?.vao === vao) {
        this.#vaos.delete(key);
        for (const unsubscribe of entry.unsubscribe) unsubscribe();
        gl.deleteVertexArray(vao);
      }
    };
    const usedBuffers = new Set([...buffers, ...(indexBuffer ? [indexBuffer] : [])]);
    this.#vaos.set(key, {
      vao,
      unsubscribe: [...usedBuffers].map((buffer) => buffer.onDestroy(release)),
    });

    return vao;
  }

  destroy(): void {
    for (const { vao, unsubscribe } of this.#vaos.values()) {
      for (const fn of unsubscribe) fn();
      this.#gl.deleteVertexArray(vao);
    }
    this.#vaos.clear();
  }
}
