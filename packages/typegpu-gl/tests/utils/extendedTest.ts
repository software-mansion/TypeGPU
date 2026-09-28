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

  const mockRenderbuffer = () => ({ _type: 'renderbuffer' }) as unknown as WebGLRenderbuffer;

  const mockFramebuffer = () => {
    const framebuffer = { _type: 'framebuffer' } as unknown as WebGLFramebuffer;
    framebuffers.push(framebuffer);
    return framebuffer;
  };

  const gl = {
    canvas,

    // Buffer constants
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    UNIFORM_BUFFER: 35345,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,

    // Shader constants
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    INVALID_INDEX: 4294967295,

    // Clear constants
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    STENCIL_BUFFER_BIT: 1024,
    COLOR: 6144,
    DEPTH: 6145,
    STENCIL: 6146,

    // Draw constants
    POINTS: 0,
    LINES: 1,
    LINE_STRIP: 3,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,

    // Capabilities
    CULL_FACE: 2884,
    BLEND: 3042,
    SCISSOR_TEST: 3089,
    DEPTH_TEST: 2929,
    STENCIL_TEST: 2960,
    POLYGON_OFFSET_FILL: 32823,

    // Rasterizer state constants
    FRONT: 1028,
    BACK: 1029,
    FRONT_AND_BACK: 1032,
    CW: 2304,
    CCW: 2305,

    // Blend constants
    ZERO: 0,
    ONE: 1,
    SRC_COLOR: 768,
    ONE_MINUS_SRC_COLOR: 769,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    DST_ALPHA: 772,
    ONE_MINUS_DST_ALPHA: 773,
    DST_COLOR: 774,
    ONE_MINUS_DST_COLOR: 775,
    SRC_ALPHA_SATURATE: 776,
    CONSTANT_COLOR: 32769,
    ONE_MINUS_CONSTANT_COLOR: 32770,
    FUNC_ADD: 32774,
    MIN: 32775,
    MAX: 32776,
    FUNC_SUBTRACT: 32778,
    FUNC_REVERSE_SUBTRACT: 32779,

    // Depth and stencil constants
    NEVER: 512,
    LESS: 513,
    EQUAL: 514,
    LEQUAL: 515,
    GREATER: 516,
    NOTEQUAL: 517,
    GEQUAL: 518,
    ALWAYS: 519,
    KEEP: 7680,
    REPLACE: 7681,
    INCR: 7682,
    DECR: 7683,
    INVERT: 5386,
    INCR_WRAP: 34055,
    DECR_WRAP: 34056,

    // Vertex attribute and index types
    BYTE: 5120,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    INT: 5124,
    UNSIGNED_INT: 5125,
    UNSIGNED_INT_2_10_10_10_REV: 33640,
    INT_2_10_10_10_REV: 36255,

    // Framebuffer constants
    FRAMEBUFFER: 36160,
    FRAMEBUFFER_COMPLETE: 36053,
    COLOR_ATTACHMENT0: 36064,
    COLOR_ATTACHMENT1: 36065,
    COLOR_ATTACHMENT2: 36066,
    COLOR_ATTACHMENT3: 36067,
    DEPTH_ATTACHMENT: 36096,
    STENCIL_ATTACHMENT: 36128,
    DEPTH_STENCIL_ATTACHMENT: 33306,
    RENDERBUFFER: 36161,
    NONE: 0,
    MAX_DRAW_BUFFERS: 34852,
    MAX_COLOR_ATTACHMENTS: 36063,

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
    DEPTH_COMPONENT: 6402,
    DEPTH_STENCIL: 34041,
    DEPTH_COMPONENT16: 33189,
    DEPTH_COMPONENT24: 33190,
    DEPTH_COMPONENT32F: 36012,
    DEPTH24_STENCIL8: 35056,
    DEPTH32F_STENCIL8: 36013,
    STENCIL_INDEX8: 36168,
    UNSIGNED_INT_24_8: 34042,
    FLOAT_32_UNSIGNED_INT_24_8_REV: 36269,
    UNSIGNED_BYTE: 5121,
    HALF_FLOAT: 5131,
    FLOAT: 5126,

    // Methods
    getExtension: vi.fn((_name: string): unknown => null),

    createBuffer: vi.fn(mockBuffer),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bindBufferBase: vi.fn(),
    bufferData: vi.fn(),
    bufferSubData: vi.fn(),

    enableVertexAttribArray: vi.fn(),
    disableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    vertexAttribIPointer: vi.fn(),
    vertexAttribDivisor: vi.fn(),

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
    uniform1fv: vi.fn(),
    uniform2fv: vi.fn(),
    uniform3fv: vi.fn(),
    uniform4fv: vi.fn(),
    uniform1iv: vi.fn(),
    uniform2iv: vi.fn(),
    uniform3iv: vi.fn(),
    uniform4iv: vi.fn(),
    uniform1uiv: vi.fn(),
    uniform2uiv: vi.fn(),
    uniform3uiv: vi.fn(),
    uniform4uiv: vi.fn(),
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
    framebufferRenderbuffer: vi.fn(),
    checkFramebufferStatus: vi.fn(() => 36053),
    drawBuffers: vi.fn(),

    createRenderbuffer: vi.fn(mockRenderbuffer),
    deleteRenderbuffer: vi.fn(),
    bindRenderbuffer: vi.fn(),
    renderbufferStorage: vi.fn(),

    getContextAttributes: vi.fn(
      (): WebGLContextAttributes => ({ depth: true, stencil: false, antialias: true }),
    ),
    getParameter: vi.fn((pname: number) => {
      if (pname === 34852 || pname === 36063) return 8; // MAX_DRAW_BUFFERS, MAX_COLOR_ATTACHMENTS
      return null;
    }),

    enable: vi.fn(),
    disable: vi.fn(),
    cullFace: vi.fn(),
    frontFace: vi.fn(),
    colorMask: vi.fn(),
    blendEquationSeparate: vi.fn(),
    blendFuncSeparate: vi.fn(),
    blendColor: vi.fn(),
    depthFunc: vi.fn(),
    depthMask: vi.fn(),
    polygonOffset: vi.fn(),
    stencilFuncSeparate: vi.fn(),
    stencilOpSeparate: vi.fn(),
    stencilMaskSeparate: vi.fn(),

    viewport: vi.fn(),
    clearColor: vi.fn(),
    clearDepth: vi.fn(),
    clearStencil: vi.fn(),
    clear: vi.fn(),
    clearBufferfv: vi.fn(),
    clearBufferiv: vi.fn(),
    clearBufferuiv: vi.fn(),
    clearBufferfi: vi.fn(),
    drawArrays: vi.fn(),
    drawArraysInstanced: vi.fn(),
    drawElementsInstanced: vi.fn(),
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
