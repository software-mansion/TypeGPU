/**
 * FPS Counter utility for examples.
 * Displays FPS and frame time in a small overlay in the top-left corner.
 * Uses monkey patching to automatically detect frames without manual tick() calls.
 */
export class FPSCounter {
  #element: HTMLDivElement;
  #frames: number[] = []; // works like np.roll
  #lastTime = performance.now();
  #rafId: number | null = null;
  #isDisposed = false;
  originalRAF: (callback: FrameRequestCallback) => number;
  patchedRAF: (callback: FrameRequestCallback) => number;

  constructor() {
    this.#element = document.createElement('div');
    this.#element.className =
      'fixed top-2.5 left-2.5 bg-black/70 font-mono text-xs px-3 py-2 rounded z-[10000] pointer-events-none select-none leading-relaxed min-w-[120px] whitespace-pre border border-white/10 shadow-lg backdrop-blur-sm transition-colors duration-200';
    this.#element.textContent = 'FPS: --\nFrame: -- ms';
    document.body.appendChild(this.#element);

    this.originalRAF = window.requestAnimationFrame.bind(window);
    this.patchedRAF = ((callback: FrameRequestCallback) => {
      const wrappedCallback: FrameRequestCallback = (time: DOMHighResTimeStamp) => {
        this.tick();
        return callback(time);
      };
      return this.originalRAF(wrappedCallback);
    });

    // monkey patch requestAnimationFrame
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

  private update = (): void => {    if (this.#isDisposed) {
      return;
    }
    if (this.#frames.length > 0) {
      const avgFrameTime = this.#frames.reduce((a, b) => a + b, 0) / this.#frames.length;
      const fps = Math.round(1000 / avgFrameTime);
      const frameTime = avgFrameTime.toFixed(2);

      let color = 'green'; // green for 60+ FPS
      if (fps < 30) {
        color = 'red'; // red for < 30 FPS
      } else if (fps < 50) {
        color = 'orange'; // orange for 30-50 FPS
      }

      this.#element.classList.remove('text-green-400', 'text-orange-400', 'text-red-400');
      this.#element.classList.add(`text-${color}-400`);
      this.#element.textContent = `FPS: ${fps}\nFrame: ${frameTime} ms`;
    }
    this.#rafId = this.originalRAF(this.update);
  };


  public dispose(): void {
    this.#isDisposed = true;
    window.requestAnimationFrame = this.originalRAF;

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
