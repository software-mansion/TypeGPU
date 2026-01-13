/**
 * FPS Counter utility for examples.
 * Displays FPS and frame time in a small overlay in the top-left corner.
 * Uses monkey patching to automatically detect frames without manual tick() calls.
 */
export class FPSCounter {
  private element: HTMLDivElement;
  private frames: number[] = [];
  private lastTime = performance.now();
  private rafId: number | null = null;
  private originalRAF: typeof requestAnimationFrame;
  private patchedRAF: typeof requestAnimationFrame;

  constructor() {
    // Create and style the overlay element
    this.element = document.createElement('div');
    this.element.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: #00ff00;
      font-family: monospace;
      font-size: 12px;
      padding: 8px 12px;
      border-radius: 4px;
      z-index: 10000;
      pointer-events: none;
      user-select: none;
      line-height: 1.4;
      min-width: 120px;
    `;
    this.element.textContent = 'FPS: --\nFrame: -- ms';
    document.body.appendChild(this.element);

    // Store the original requestAnimationFrame
    this.originalRAF = window.requestAnimationFrame.bind(window);

    // Create patched version that tracks frames
    this.patchedRAF = ((callback: FrameRequestCallback) => {
      const wrappedCallback: FrameRequestCallback = (time: DOMHighResTimeStamp) => {
        this.tick();
        return callback(time);
      };
      return this.originalRAF(wrappedCallback);
    }) as typeof requestAnimationFrame;

    // Monkey patch the global requestAnimationFrame
    window.requestAnimationFrame = this.patchedRAF;

    // Start the update loop for the display
    this.update();
  }

  private tick(): void {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;

    this.frames.push(delta);
    if (this.frames.length > 60) {
      this.frames.shift();
    }
  }

  private update = (): void => {
    if (this.frames.length > 0) {
      const avgFrameTime = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
      const fps = Math.round(1000 / avgFrameTime);
      const frameTime = avgFrameTime.toFixed(2);

      // Color code based on FPS
      let color = '#00ff00'; // Green for 60+ FPS
      if (fps < 30) {
        color = '#ff0000'; // Red for < 30 FPS
      } else if (fps < 50) {
        color = '#ffaa00'; // Orange for 30-50 FPS
      }

      this.element.style.color = color;
      this.element.textContent = `FPS: ${fps}\nFrame: ${frameTime} ms`;
    }

    // Use original RAF to avoid double counting
    this.rafId = this.originalRAF(this.update);
  };

  /**
   * Clean up and remove the FPS counter from the DOM.
   * Restores the original requestAnimationFrame.
   */
  public dispose(): void {
    // Restore original requestAnimationFrame
    window.requestAnimationFrame = this.originalRAF;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.element.remove();
  }
}

/**
 * Creates and returns an FPS counter instance.
 * The counter automatically tracks frames by monkey patching requestAnimationFrame.
 * Remember to call dispose() when cleaning up to restore the original RAF.
 */
export function createFPSCounter(): FPSCounter {
  return new FPSCounter();
}
