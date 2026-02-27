import { beforeEach, vi } from 'vitest';
import { createDeepNoopProxy } from './testUtils.ts';

export function setupCommonMocks() {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => {
        return createDeepNoopProxy(
          {} as unknown as CanvasRenderingContext2D,
          new Set(),
          // oxlint-disable-next-line typescript/no-explicit-any we testing here
        ) as any;
      },
    );

    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      get: () => 256,
      set: () => {},
      configurable: true,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'height', {
      get: () => 256,
      set: () => {},
      configurable: true,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
      get: () => 256,
      configurable: true,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
      get: () => 256,
      configurable: true,
    });

    // jsdom will sometimes throw css related errors which we don't care about
    vi.spyOn(console, 'error').mockImplementation(() => {});

    let callbackInvoked = false;

    Object.defineProperty(
      HTMLVideoElement.prototype,
      'requestVideoFrameCallback',
      {
        value: (callback: VideoFrameRequestCallback) => {
          if (!callbackInvoked) {
            callbackInvoked = true;
            callback(0, {
              width: 640,
              height: 480,
            } as VideoFrameCallbackMetadata);
          }
          return 0; // Mock ID
        },
        writable: true,
        configurable: true,
      },
    );

    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
      get: () => 4, // HAVE_ENOUGH_DATA
      configurable: true,
    });

    vi.stubGlobal('fetch', mockFetch);
  });
}

export function mockFonts() {
  Object.defineProperty(document, 'fonts', {
    value: {
      load: vi.fn().mockResolvedValue([{}, {}]),
    },
  });
}

export function mockResizeObserver() {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  );
}

export function mockMathRandom() {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
}

export function mockCreateImageBitmap({ width = 2, height = 2 } = {}) {
  vi.stubGlobal('createImageBitmap', async () => {
    return {
      width,
      height,
      close: vi.fn(),
      getImageData: () => {
        return {
          data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
          width,
          height,
        };
      },
    } as ImageBitmap;
  });
}

const audioRegExp = /\.ogg$|\.wav$/;
const imageRegExp = /(\.jpg$|\.png$)/;
const mnistRegExp = /^\/TypeGPU\/assets\/mnist-weights\//;
const objRegExp = /\.obj$/;
const fetchMockMap = new Map<RegExp, () => Response>();
async function mockFetch(url: string): Promise<Response> {
  for (const [pattern, handler] of fetchMockMap) {
    if (pattern.test(url)) {
      return handler();
    }
  }
  return new Response();
}

export function mockImageLoading() {
  const mockImage = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
  if (fetchMockMap.has(imageRegExp)) return;
  fetchMockMap.set(
    imageRegExp,
    () =>
      new Response(mockImage, {
        headers: {
          'Content-Type': 'image/png',
        },
      }),
  );
}

export function mockMnistWeights() {
  if (fetchMockMap.has(mnistRegExp)) return;

  // https://numpy.org/devdocs/reference/generated/numpy.lib.format.html
  const mockHeader =
    "{'descr': '<f4', 'fortran_order': False, 'shape': (0, 0)}";
  const headerBuffer = new TextEncoder().encode(mockHeader);
  const totalBuffer = new ArrayBuffer(headerBuffer.length + 100);
  const view = new Uint8Array(totalBuffer);
  view.set(headerBuffer, 0);

  fetchMockMap.set(mnistRegExp, () => new Response(totalBuffer));
}
const mockAudioParam = { value: 0, setTargetAtTime: vi.fn() };

const mockGainNode = {
  connect: vi.fn(),
  gain: mockAudioParam,
};

const mockAudioBufferSourceNode = {
  buffer: null,
  loop: false,
  playbackRate: mockAudioParam,
  connect: vi.fn(),
  start: vi.fn(),
};

export function mockAudioLoading() {
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => ({
      createGain: vi.fn(() => mockGainNode),
      destination: {},
      createBufferSource: vi.fn(() => mockAudioBufferSourceNode),
      decodeAudioData: vi.fn(async () => null),
    })),
  );

  if (fetchMockMap.has(audioRegExp)) return;
  fetchMockMap.set(
    audioRegExp,
    () =>
      new Response(null, {
        headers: {
          'Content-Type': 'audio/wav',
        },
      }),
  );
}

export function mock3DModelLoading() {
  vi.doMock('@loaders.gl/core', () => ({
    load: vi.fn(async () => ({
      attributes: {
        POSITION: {
          value: new Float32Array(),
        },
        NORMAL: {
          value: new Float32Array(),
        },
        TEXCOORD_0: {
          value: new Float32Array(),
        },
      },
    })),
  }));

  vi.doMock('@loaders.gl/obj', () => ({
    OBJLoader: {},
  }));

  mockImageLoading();
  if (fetchMockMap.has(objRegExp)) return;
  fetchMockMap.set(objRegExp, () =>
    new Response('', {
      headers: {
        'Content-Type': 'text/plain',
      },
    }));
}
