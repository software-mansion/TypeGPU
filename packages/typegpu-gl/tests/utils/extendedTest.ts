import { it as base, vi } from 'vitest';
// oxlint-disable-next-line import/no-unassigned-import -- imported for side effects
import './webgpuGlobals.ts';

function createMockOffscreenCanvas(width = 256, height = 256) {
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => ctx),
    transferToImageBitmap: vi.fn(() => ({}) as ImageBitmap),
  };

  const ctx = createMockWebGL2(canvas as unknown as OffscreenCanvas);

  return canvas;
}

function createMockHTMLCanvas(width = 256, height = 256) {
  const bitmaprenderer = {
    transferFromImageBitmap: vi.fn(),
  };

  const canvas = {
    width,
    height,
    getContext: vi.fn((type: 'webgl2' | 'webgl' | 'experimental-webgl' | 'bitmaprenderer') => {
      if (type === 'bitmaprenderer') return bitmaprenderer;
      return ctx;
    }),
  };

  const ctx = createMockWebGL2(canvas as unknown as OffscreenCanvas);

  return canvas;
}

function createMockWebGL2(canvas: OffscreenCanvas) {
  const buffers: WebGLBuffer[] = [];
  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];

  let shaderCompileOk = true;
  let programLinkOk = true;
  let uniformBlockIndex = 0;

  const mockShader = () => {
    const s = { _type: 'shader' };
    shaders.push(s as unknown as WebGLShader);
    return s as unknown as WebGLShader;
  };

  const mockProgram = () => {
    const p = { _type: 'program' };
    programs.push(p as unknown as WebGLProgram);
    return p as unknown as WebGLProgram;
  };

  const mockBuffer = () => {
    const b = { _type: 'buffer' };
    buffers.push(b as unknown as WebGLBuffer);
    return b as unknown as WebGLBuffer;
  };

  const gl = {
    canvas,

    // Buffer constants
    UNIFORM_BUFFER: 35345,
    DYNAMIC_DRAW: 35048,

    // Shader constants
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    INVALID_INDEX: 4294967295,

    // Clear constants
    COLOR_BUFFER_BIT: 16384,

    // Draw constants
    TRIANGLES: 4,

    // Framebuffer constants
    FRAMEBUFFER: 36160,

    // Methods
    createBuffer: vi.fn(mockBuffer),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bindBufferBase: vi.fn(),
    bufferData: vi.fn(),

    createShader: vi.fn((_type: number) => mockShader()),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn((_shader: WebGLShader, pname: number) => {
      if (pname === 35713) return shaderCompileOk; // COMPILE_STATUS
      return null;
    }),
    getShaderInfoLog: vi.fn(() => 'mock shader info log'),
    deleteShader: vi.fn(),

    createProgram: vi.fn(mockProgram),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program: WebGLProgram, pname: number) => {
      if (pname === 35714) return programLinkOk; // LINK_STATUS
      return null;
    }),
    getProgramInfoLog: vi.fn(() => 'mock program info log'),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),

    getUniformBlockIndex: vi.fn(() => {
      return uniformBlockIndex++;
    }),
    uniformBlockBinding: vi.fn(),

    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(),
  };

  return gl;
}

export const it = base.extend<{
  rootCanvas: OffscreenCanvas & { mock: ReturnType<typeof createMockOffscreenCanvas> };
  gl: WebGL2RenderingContext & { mock: ReturnType<typeof createMockWebGL2> };
  createHTMLCanvas: (options: {
    width?: number;
    height?: number;
  }) => HTMLCanvasElement & { mock: ReturnType<typeof createMockHTMLCanvas> };
}>({
  rootCanvas: async ({ task }, use) => {
    const mockCanvas = createMockOffscreenCanvas();
    await use(mockCanvas as unknown as OffscreenCanvas & { mock: typeof mockCanvas });
  },

  gl: async ({ task, rootCanvas }, use) => {
    const mockGl = createMockWebGL2(rootCanvas);
    await use(
      mockGl as unknown as WebGL2RenderingContext & {
        mock: typeof mockGl;
      },
    );
  },

  createHTMLCanvas: async ({ task }, use) => {
    await use((options) => {
      const mockCanvas = createMockHTMLCanvas(options.width, options.height);
      return mockCanvas as unknown as HTMLCanvasElement & { mock: typeof mockCanvas };
    });
  },
});

export const test = it;
