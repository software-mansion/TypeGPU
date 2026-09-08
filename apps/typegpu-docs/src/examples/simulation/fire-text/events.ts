import { d } from 'typegpu';

const POINTER_VELOCITY_SCALE = 30;
const POINTER_DELTA_CLAMP = 3;

export class EventHandler {
  private _isMouseDown = false;
  private mouseTexX = 0;
  private mouseTexY = 0;
  private prevMouseTexX = 0;
  private prevMouseTexY = 0;
  private resizeObserver: ResizeObserver;

  private resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
    const targetHeight = Math.max(1, Math.floor(rect.height * dpr));

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
  }

  private canvasToTex(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      return;
    }
    const u = (e.clientX - r.left) / r.width;
    const v = (e.clientY - r.top) / r.height;
    this.mouseTexX = Math.floor(u * this.getTextureSize());
    this.mouseTexY = Math.floor(v * this.getTextureSize());
  }

  private hideHelp = () => {
    const helpElem = document.getElementById('help');
    if (helpElem) {
      helpElem.style.opacity = '0';
    }
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private getTextureSize: () => number,
  ) {
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerRelease);
    canvas.addEventListener('pointercancel', this.onPointerRelease);

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(canvas);
    this.resizeCanvas();

    for (const eventName of ['click', 'keydown', 'wheel', 'touchstart']) {
      canvas.addEventListener(eventName, this.hideHelp, { once: true, passive: true });
    }

    canvas.style.touchAction = 'none';
  }

  get isMouseDown() {
    return this._isMouseDown;
  }

  get texPos() {
    return d.vec2u(this.mouseTexX, this.mouseTexY);
  }

  cleanup() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerRelease);
    this.canvas.removeEventListener('pointercancel', this.onPointerRelease);

    this.resizeObserver.disconnect();
  }

  onPointerDown = (e: PointerEvent) => {
    this._isMouseDown = true;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    this.canvasToTex(e);
    this.prevMouseTexX = this.mouseTexX;
    this.prevMouseTexY = this.mouseTexY;
  };

  onPointerMove = (e: PointerEvent) => {
    if (this._isMouseDown) {
      this.canvasToTex(e);
    }
  };

  onPointerRelease = (e: PointerEvent) => {
    this._isMouseDown = false;
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
  };

  consumePointerVelocity(): d.v2f {
    let dx = 0;
    let dy = 0;
    if (this._isMouseDown) {
      dx = this.mouseTexX - this.prevMouseTexX;
      dy = this.mouseTexY - this.prevMouseTexY;

      // Clamp dx to [-3, 3] so max velocity (90) is naturally reached on fast swipes,
      // while slow movement (e.g. 0.3px) produces small velocity (9).
      dx = Math.max(-POINTER_DELTA_CLAMP, Math.min(POINTER_DELTA_CLAMP, dx));
      dy = Math.max(-POINTER_DELTA_CLAMP, Math.min(POINTER_DELTA_CLAMP, dy));
    }

    this.prevMouseTexX = this.mouseTexX;
    this.prevMouseTexY = this.mouseTexY;

    return d.vec2f(dx * POINTER_VELOCITY_SCALE, dy * POINTER_VELOCITY_SCALE);
  }
}
