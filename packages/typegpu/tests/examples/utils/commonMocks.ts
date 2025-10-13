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
          // biome-ignore lint/suspicious/noExplicitAny: we testing here
        ) as any;
      },
    );

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
            callback(
              0,
              { width: 640, height: 480 } as VideoFrameCallbackMetadata,
            );
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

export function mockImageLoading({ width = 2, height = 2 } = {}) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (
      url.includes('.jpg') || url.includes('.png') ||
      url.startsWith('/TypeGPU/')
    ) {
      const mockImage = new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]);
      return new Response(mockImage, {
        headers: {
          'Content-Type': 'image/png',
        },
      });
    }
  });

  vi.stubGlobal('createImageBitmap', async () => {
    return {
      width,
      height,
      close: () => {},
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

export function mockMnistWeights() {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.startsWith('/TypeGPU/assets/mnist-weights/')) {
      // https://numpy.org/devdocs/reference/generated/numpy.lib.format.html
      const mockHeader =
        "{'descr': '<f4', 'fortran_order': False, 'shape': (0, 0)}";
      const headerBuffer = new TextEncoder().encode(mockHeader);
      const totalBuffer = new ArrayBuffer(headerBuffer.length + 100);
      const view = new Uint8Array(totalBuffer);
      view.set(headerBuffer, 0);
      return new Response(totalBuffer);
    }
  });
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

  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('.jpg') || url.includes('.png')) {
      const mockImage = new Uint8Array();
      return new Response(mockImage, {
        headers: {
          'Content-Type': 'image/png',
        },
      });
    }
    if (url.includes('.obj')) {
      return new Response('', {
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
  });

  vi.stubGlobal('createImageBitmap', async () => {
    return {
      width: 2,
      height: 2,
      close: () => {},
    } as ImageBitmap;
  });
}
