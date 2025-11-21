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

export function mockImageLoading({ width = 2, height = 2 } = {}) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (
      url.includes('.jpg') ||
      url.includes('.png') ||
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

export function mockAudioLoading() {
  // Mock fetch for audio files
  const originalFetch = global.fetch;
  vi.stubGlobal('fetch', async (url: string) => {
    if (
      typeof url === 'string' &&
      url.includes('/TypeGPU/assets/jelly-switch/') &&
      (url.endsWith('.ogg') || url.endsWith('.wav'))
    ) {
      // Return a minimal valid audio file (empty WAV header + silence)
      const wavHeader = new Uint8Array([
        0x52,
        0x49,
        0x46,
        0x46, // "RIFF"
        0x24,
        0x08,
        0x00,
        0x00, // File size
        0x57,
        0x41,
        0x56,
        0x45, // "WAVE"
        0x66,
        0x6d,
        0x74,
        0x20, // "fmt "
        0x10,
        0x00,
        0x00,
        0x00, // Chunk size
        0x01,
        0x00, // Audio format (PCM)
        0x02,
        0x00, // Number of channels
        0x44,
        0xac,
        0x00,
        0x00, // Sample rate (44100)
        0x88,
        0x58,
        0x01,
        0x00, // Byte rate
        0x04,
        0x00, // Block align
        0x10,
        0x00, // Bits per sample
        0x64,
        0x61,
        0x74,
        0x61, // "data"
        0x00,
        0x08,
        0x00,
        0x00, // Data size
      ]);
      const silence = new Uint8Array(2048); // 2048 bytes of silence
      const audioData = new Uint8Array(wavHeader.length + silence.length);
      audioData.set(wavHeader);
      audioData.set(silence, wavHeader.length);

      return new Response(audioData, {
        headers: {
          'Content-Type': url.endsWith('.ogg') ? 'audio/ogg' : 'audio/wav',
        },
      });
    }

    // Fall back to original fetch for other URLs
    return originalFetch(url);
  });

  // Mock AudioContext with minimal methods needed for SwitchBehavior
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => ({
      createGain: vi.fn(() => ({
        connect: vi.fn(),
        gain: { value: 0, setTargetAtTime: vi.fn() },
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        loop: false,
        playbackRate: { value: 1, setTargetAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      decodeAudioData: vi.fn(async () => ({
        duration: 1,
        length: 44100,
        sampleRate: 44100,
        numberOfChannels: 2,
        getChannelData: vi.fn(() => new Float32Array(44100)),
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
      })),
      destination: {},
    })),
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
