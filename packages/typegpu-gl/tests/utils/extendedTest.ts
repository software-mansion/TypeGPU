import { test as base, vi } from 'vitest';
// oxlint-disable-next-line import/no-unassigned-import -- imported for side effects
import 'typegpu-testing-utility';

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
  const textures: WebGLTexture[] = [];
  const samplers: WebGLSampler[] = [];
  const framebuffers: WebGLFramebuffer[] = [];

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

  const mockVertexArray = () => {
    const va = { _type: 'vertexArray' };

    return va as unknown as WebGLVertexArrayObject;
  };

  const mockTexture = () => {
    const texture = { _type: 'texture' } as unknown as WebGLTexture;
    textures.push(texture);
    return texture;
  };

  const mockSampler = () => {
    const sampler = { _type: 'sampler' } as unknown as WebGLSampler;
    samplers.push(sampler);
    return sampler;
  };

  const mockFramebuffer = () => {
    const framebuffer = { _type: 'framebuffer' } as unknown as WebGLFramebuffer;
    framebuffers.push(framebuffer);
    return framebuffer;
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
    FRAMEBUFFER_COMPLETE: 36053,
    COLOR_ATTACHMENT0: 36064,

    // Texture constants
    TEXTURE_2D: 3553,
    TEXTURE0: 33984,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_MIN_LOD: 33082,
    TEXTURE_MAX_LOD: 33083,
    NEAREST: 9728,
    LINEAR: 9729,
    NEAREST_MIPMAP_NEAREST: 9984,
    LINEAR_MIPMAP_NEAREST: 9985,
    NEAREST_MIPMAP_LINEAR: 9986,
    LINEAR_MIPMAP_LINEAR: 9987,
    CLAMP_TO_EDGE: 33071,
    REPEAT: 10497,
    MIRRORED_REPEAT: 33648,
    UNPACK_ALIGNMENT: 3317,
    RED: 6403,
    RG: 33319,
    RGBA: 6408,
    R8: 33321,
    RG8: 33323,
    RGBA8: 32856,
    SRGB8_ALPHA8: 35907,
    RGBA16F: 34842,
    RGBA32F: 34836,
    UNSIGNED_BYTE: 5121,
    HALF_FLOAT: 5131,
    FLOAT: 5126,

    // Methods
    createBuffer: vi.fn(mockBuffer),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bindBufferBase: vi.fn(),
    bufferData: vi.fn(),

    createVertexArray: vi.fn(mockVertexArray),
    deleteVertexArray: vi.fn(),
    bindVertexArray: vi.fn(),

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
    getUniformLocation: vi.fn(
      (_program: WebGLProgram, name: string) =>
        ({
          _type: 'uniform-location',
          name,
        }) as unknown as WebGLUniformLocation,
    ),
    uniform1f: vi.fn(),
    uniform1i: vi.fn(),
    uniform1ui: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniformMatrix2fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    uniformMatrix4fv: vi.fn(),

    createTexture: vi.fn(mockTexture),
    deleteTexture: vi.fn(),
    bindTexture: vi.fn(),
    activeTexture: vi.fn(),
    texStorage2D: vi.fn(),
    texParameteri: vi.fn(),
    texSubImage2D: vi.fn(),
    pixelStorei: vi.fn(),
    generateMipmap: vi.fn(),

    createSampler: vi.fn(mockSampler),
    deleteSampler: vi.fn(),
    bindSampler: vi.fn(),
    samplerParameteri: vi.fn(),
    samplerParameterf: vi.fn(),

    createFramebuffer: vi.fn(mockFramebuffer),
    deleteFramebuffer: vi.fn(),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 36053),

    viewport: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    drawArrays: vi.fn(),
  };

  return gl;
}

export const it = base.extend<{
  rootCanvas: OffscreenCanvas & {
    mock: ReturnType<typeof createMockOffscreenCanvas>;
  };
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
      return mockCanvas as unknown as HTMLCanvasElement & {
        mock: typeof mockCanvas;
      };
    });
  },
});

export const test = it;
