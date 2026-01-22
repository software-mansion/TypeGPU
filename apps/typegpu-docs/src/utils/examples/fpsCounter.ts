/**
 * FPS Counter utility for examples, displays FPS and frame time in a small overlay.
 */
export class FPSCounter {
  private static originalRAF:
    | ((callback: FrameRequestCallback) => number)
    | null = null;
  private static patchedRAF:
    | ((callback: FrameRequestCallback) => number)
    | null = null;
  private static instances = new Set<FPSCounter>();
  private static lastFrameTime: number | null = null;
  #element: HTMLDivElement;
  #frames: number[] = []; // works like np.roll
  #lastTime = performance.now();
  #rafId: number | null = null;
  originalRAF: (callback: FrameRequestCallback) => number;
  patchedRAF: (callback: FrameRequestCallback) => number;

  constructor() {
    this.#element = document.createElement('div');
    this.#element.className =
      'fixed top-2.5 left-2.5 bg-black/70 font-mono text-xs px-3 py-2 rounded z-[10000] pointer-events-none select-none leading-relaxed min-w-[120px] whitespace-pre border border-white/10 shadow-lg backdrop-blur-sm transition-colors duration-200';
    this.#element.textContent = 'FPS: --\nFrame: -- ms';
    document.body.appendChild(this.#element);

    if (!FPSCounter.originalRAF) {
      FPSCounter.originalRAF = window.requestAnimationFrame.bind(window);
    }

    if (!FPSCounter.patchedRAF) {
      FPSCounter.patchedRAF = (callback: FrameRequestCallback) => {
        const wrappedCallback: FrameRequestCallback = (
          time: DOMHighResTimeStamp,
        ) => {
          if (FPSCounter.lastFrameTime !== time) {
            FPSCounter.lastFrameTime = time;
            for (const instance of FPSCounter.instances) {
              instance.tick();
            }
          }
          return callback(time);
        };
        const originalRAF = FPSCounter.originalRAF;
        if (!originalRAF) {
          throw new Error('requestAnimationFrame not available.');
        }
        return originalRAF(wrappedCallback);
      };
    }

    FPSCounter.instances.add(this);
    this.originalRAF = FPSCounter.originalRAF;
    this.patchedRAF = FPSCounter.patchedRAF;

    window.requestAnimationFrame = this.patchedRAF;
    this.update();
  }

  private tick(): void {
    const now = performance.now();
    const delta = now - this.#lastTime;
    this.#lastTime = now;

    this.#frames.push(delta);
    if (this.#frames.length > 60) {
      this.#frames.shift();
    }
  }

  private update = (): void => {
    if (this.#frames.length > 0) {
      const avgFrameTime = this.#frames.reduce((a, b) => a + b, 0) /
        this.#frames.length;
      const fps = Math.round(1000 / avgFrameTime);
      const frameTime = avgFrameTime.toFixed(2);

      let color = 'green'; // green for 60+ fps
      if (fps < 30) {
        color = 'red'; // red for < 30 fps
      } else if (fps < 50) {
        color = 'orange'; // orange for 30-50 fps
      }

      this.#element.classList.remove(
        'text-green-400',
        'text-orange-400',
        'text-red-400',
      );
      this.#element.classList.add(`text-${color}-400`);
      this.#element.textContent = `FPS: ${fps}\nFrame: ${frameTime} ms`;
    }
    this.#rafId = this.originalRAF(this.update);
  };

  public dispose(): void {
    FPSCounter.instances.delete(this);
    if (FPSCounter.instances.size === 0 && FPSCounter.originalRAF) {
      window.requestAnimationFrame = FPSCounter.originalRAF;
      FPSCounter.patchedRAF = null;
      FPSCounter.lastFrameTime = null;
    }

    if (this.#rafId !== null) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = null;
    }
    this.#element.remove();
  }
}

export function createFPSCounter(): FPSCounter {
  return new FPSCounter();
}
