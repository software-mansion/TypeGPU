import { beforeEach, vi } from 'vitest';
import { createDeepNoopProxy } from './testUtils.ts';

export function setupCommonMocks() {
  beforeEach(() => {
    vi.resetAllMocks();

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      return createDeepNoopProxy(
        {} as unknown as CanvasRenderingContext2D,
        new Set(),
        // oxlint-disable-next-line typescript/no-explicit-any -- we testing here
      ) as any;
    });

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

    vi.stubGlobal('fetch', mockFetch);
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

const imageRegExp = /(\.jpg$|\.png$)/;
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
