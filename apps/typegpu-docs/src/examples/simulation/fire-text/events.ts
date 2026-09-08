import { d } from 'typegpu';

const POINTER_VELOCITY_SCALE = 30;
const POINTER_DELTA_CLAMP = 3;

export function strokeAabb(
  a: d.v2f,
  b: d.v2f,
  radius: number,
  texSize: number,
) {
  const pad = radius + 1;
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - pad));
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - pad));
  const x1 = Math.min(texSize - 1, Math.ceil(Math.max(a.x, b.x) + pad));
  const y1 = Math.min(texSize - 1, Math.ceil(Math.max(a.y, b.y) + pad));
  if (x0 > x1 || y0 > y1) {
    return undefined;
  }
  return { originX: x0, originY: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export class EventHandler {
  private _isMouseDown = false;
  private _inside = false;
  private _breakStroke = false;
  private capturedPointerId: number | undefined;
  private mouseTexX = 0;
  private mouseTexY = 0;
  private prevMouseTexX = 0;
  private prevMouseTexY = 0;

  private canvasToTex(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      return;
    }
    this.mouseTexX = ((e.clientX - r.left) / r.width) * this.getTextureSize();
    this.mouseTexY = ((e.clientY - r.top) / r.height) * this.getTextureSize();
  }

  private hasCapture() {
    return (
      this.capturedPointerId !== undefined &&
      this.canvas.hasPointerCapture(this.capturedPointerId)
    );
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
    canvas.addEventListener('pointerenter', this.onPointerEnter);
    canvas.addEventListener('pointerleave', this.onPointerLeave);

    for (const eventName of ['click', 'keydown', 'wheel', 'touchstart']) {
      canvas.addEventListener(eventName, this.hideHelp, { once: true, passive: true });
    }

    canvas.style.touchAction = 'none';
  }

  get isMouseDown() {
    return this._isMouseDown;
  }

  /** True while a stroke should be applied — not while the pointer is outside without capture. */
  get isPainting() {
    return this._isMouseDown && (this._inside || this.hasCapture());
  }

  get texPos() {
    return d.vec2f(this.mouseTexX, this.mouseTexY);
  }

  get prevTexPos() {
    return d.vec2f(this.prevMouseTexX, this.prevMouseTexY);
  }

  cleanup() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerRelease);
    this.canvas.removeEventListener('pointercancel', this.onPointerRelease);
    this.canvas.removeEventListener('pointerenter', this.onPointerEnter);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
  }

  onPointerDown = (e: PointerEvent) => {
    this._isMouseDown = true;
    this._inside = true;
    this._breakStroke = false;
    try {
      this.canvas.setPointerCapture(e.pointerId);
      this.capturedPointerId = e.pointerId;
    } catch {
      this.capturedPointerId = undefined;
    }
    this.canvasToTex(e);
    this.prevMouseTexX = this.mouseTexX;
    this.prevMouseTexY = this.mouseTexY;
  };

  onPointerMove = (e: PointerEvent) => {
    if (!this._isMouseDown) {
      return;
    }
    this.canvasToTex(e);
    if (this._breakStroke && this._inside) {
      this.prevMouseTexX = this.mouseTexX;
      this.prevMouseTexY = this.mouseTexY;
      this._breakStroke = false;
    }
  };

  onPointerEnter = () => {
    this._inside = true;
  };

  onPointerLeave = () => {
    this._inside = false;
    if (this._isMouseDown && !this.hasCapture()) {
      this._breakStroke = true;
    }
  };

  onPointerRelease = (e: PointerEvent) => {
    this._isMouseDown = false;
    this._breakStroke = false;
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    this.capturedPointerId = undefined;
  };

  pointerVelocity(): d.v2f {
    if (!this._isMouseDown) {
      return d.vec2f();
    }

    let dx = this.mouseTexX - this.prevMouseTexX;
    let dy = this.mouseTexY - this.prevMouseTexY;
    dx = Math.max(-POINTER_DELTA_CLAMP, Math.min(POINTER_DELTA_CLAMP, dx));
    dy = Math.max(-POINTER_DELTA_CLAMP, Math.min(POINTER_DELTA_CLAMP, dy));

    return d.vec2f(dx * POINTER_VELOCITY_SCALE, dy * POINTER_VELOCITY_SCALE);
  }

  commitStroke() {
    this.prevMouseTexX = this.mouseTexX;
    this.prevMouseTexY = this.mouseTexY;
  }
}
