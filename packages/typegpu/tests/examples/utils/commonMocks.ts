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

export function mockImageLoading() {
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
      width: 2,
      height: 2,
      close: () => {},
      getImageData: () => {
        return {
          data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
          width: 2,
          height: 2,
        };
      },
    } as ImageBitmap;
  });
}

export function mockMnistWeights() {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.startsWith('/TypeGPU/assets/mnist-weights/')) {
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
          value: new Float32Array([
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            1,
            0,
            1,
            1,
            0,
            0,
            0,
            1,
            1,
            0,
            1,
          ]),
        },
        NORMAL: {
          value: new Float32Array([
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
            0,
            0,
            1,
          ]),
        },
        TEXCOORD_0: {
          value: new Float32Array([
            0,
            0,
            1,
            0,
            0,
            1,
            1,
            1,
            0,
            0,
            1,
            0,
          ]),
        },
      },
    })),
  }));

  vi.doMock('@loaders.gl/obj', () => ({
    OBJLoader: {},
  }));

  vi.stubGlobal('fetch', async (url: string) => {
    if (url.includes('.jpg') || url.includes('.png')) {
      const mockImage = new Uint8Array([
        255,
        0,
        0,
        255,
        0,
        255,
        0,
        255,
        0,
        0,
        255,
        255,
        255,
        255,
        255,
        255,
      ]);
      return new Response(mockImage, {
        headers: {
          'Content-Type': 'image/png',
        },
      });
    }
    if (url.includes('.obj')) {
      const mockObjData = `
v 0.0 0.0 0.0
v 1.0 0.0 0.0
v 0.0 1.0 0.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vn 0.0 0.0 1.0
vt 0.0 0.0
vt 1.0 0.0
vt 0.0 1.0
f 1/1/1 2/2/2 3/3/3
`;
      return new Response(mockObjData, {
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
