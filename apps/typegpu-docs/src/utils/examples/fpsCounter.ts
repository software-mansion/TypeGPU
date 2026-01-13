export class FPSCounter {
  private element: HTMLDivElement;
  private frames: number[] = [];
  private lastTime = performance.now();
  private rafId: number | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.textContent = 'FPS: --\nFrame: -- ms';
    document.body.appendChild(this.element);
    
    this.update();
  }

  public tick(): void {
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

      let color = '#00ff00'; // Green for 60+ FPS
      if (fps < 30) {
        color = '#ff0000'; // Red for < 30 FPS
      } else if (fps < 50) {
        color = '#ffaa00'; // Orange for 30-50 FPS
      }

      this.element.style.color = color;
      this.element.textContent = `FPS: ${fps}\nFrame: ${frameTime} ms`;
    }

    this.rafId = requestAnimationFrame(this.update);
  };

  public dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.element.remove();
  }
}


export function createFPSCounter(): FPSCounter {
  return new FPSCounter();
}
