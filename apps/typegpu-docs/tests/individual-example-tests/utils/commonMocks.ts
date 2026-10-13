import { beforeEach, vi } from 'vitest';
import { createDeepNoopProxy } from './testUtils.ts';

export function setupCommonMocks() {
  beforeEach(() => {
    vi.resetAllMocks();

    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        return createDeepNoopProxy(
          { canvas: this } as unknown as CanvasRenderingContext2D,
          new Set(),
          // oxlint-disable-next-line typescript/no-explicit-any -- we testing here
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

    Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
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
    });

    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
      get: () => 4, // HAVE_ENOUGH_DATA
      configurable: true,
    });

    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
      })),
    );

    vi.stubGlobal('fetch', mockFetch);

    // Most examples observe the canvas to adapt its resolution
    mockResizeObserver();
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
    vi.fn(function (callback: ResizeObserverCallback) {
      let connected = true;
      const observer = {
        observe: vi.fn((target: Element) => {
          // Like the real thing, notifying about the initial size right after observing
          queueMicrotask(() => {
            if (!connected) {
              return;
            }
            const size = { inlineSize: 256, blockSize: 256 };
            const entry = {
              target,
              contentRect: { width: 256, height: 256 },
              contentBoxSize: [size],
              borderBoxSize: [size],
              devicePixelContentBoxSize: [size],
            } as unknown as ResizeObserverEntry;
            callback([entry], observer as unknown as ResizeObserver);
          });
        }),
        unobserve: vi.fn(),
        disconnect: vi.fn(() => {
          connected = false;
        }),
      };
      return observer;
    }),
  );
}

export function mockCreateImageBitmap({ width = 2, height = 2 } = {}) {
  vi.stubGlobal('createImageBitmap', async (_source: unknown, options?: ImageBitmapOptions) => {
    const w = options?.resizeWidth ?? width;
    const h = options?.resizeHeight ?? height;
    return {
      width: w,
      height: h,
      close: vi.fn(),
      getImageData: () => {
        return {
          data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
          width: w,
          height: h,
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
  const mockHeader = "{'descr': '<f4', 'fortran_order': False, 'shape': (0, 0)}";
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
    vi.fn(function () {
      return {
        createGain: vi.fn(() => mockGainNode),
        destination: {},
        createBufferSource: vi.fn(() => mockAudioBufferSourceNode),
        decodeAudioData: vi.fn(async () => null),
      };
    }),
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
          value: new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]),
        },
        NORMAL: {
          value: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
        },
        TEXCOORD_0: {
          value: new Float32Array([0, 0, 0, 0, 0, 0]),
        },
      },
    })),
  }));

  vi.doMock('@loaders.gl/obj', () => ({
    OBJLoader: {},
  }));

  mockImageLoading();
  if (fetchMockMap.has(objRegExp)) return;
  fetchMockMap.set(
    objRegExp,
    () =>
      new Response('', {
        headers: {
          'Content-Type': 'text/plain',
        },
      }),
  );
}
