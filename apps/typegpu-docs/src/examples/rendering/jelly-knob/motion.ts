import { d } from 'typegpu';

const finite = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** Phone axes -> screen axes -> the fixed camera's world-space basis. */
export function motionToWorld(x: number, y: number, z: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const screenX = c * x + s * y;
  const screenY = -s * x + c * y;
  const length = Math.hypot(2.7, 0.8);
  return d.vec3f(screenX, (0.8 * screenY + 2.7 * z) / length, (-2.7 * screenY + 0.8 * z) / length);
}

export class PhoneMotion {
  acceleration = d.vec3f();
  #gravity: number[] | undefined;
  #lastSample = -Infinity;
  #listening = false;
  #disposed = false;

  constructor() {
    // Browsers without a permission API can start immediately.
    if (typeof DeviceMotionEvent !== 'undefined' && !this.#motionAPI()?.requestPermission) {
      this.#listen();
    }
  }

  #motionAPI() {
    return typeof DeviceMotionEvent === 'undefined'
      ? undefined
      : (DeviceMotionEvent as typeof DeviceMotionEvent & {
          requestPermission?: () => Promise<string>;
        });
  }

  async enable() {
    if (this.#disposed || this.#listening) return;
    const api = this.#motionAPI();
    if (!api) return;
    try {
      if (api.requestPermission && (await api.requestPermission()) !== 'granted') return;
      if (!this.#disposed) this.#listen();
    } catch (error) {
      console.warn('Phone motion could not be enabled.', error);
    }
  }

  #listen() {
    this.#listening = true;
    window.addEventListener('devicemotion', this.#onMotion);
  }

  #onMotion = (event: DeviceMotionEvent) => {
    const now = performance.now();
    const dt = Math.min(Math.max((now - this.#lastSample) / 1000, 1 / 240), 0.1);
    const raw = event.accelerationIncludingGravity;
    let linear = [event.acceleration?.x, event.acceleration?.y, event.acceleration?.z];
    if (!linear.every((v) => typeof v === 'number' && Number.isFinite(v))) {
      const sample = [finite(raw?.x), finite(raw?.y), finite(raw?.z)];
      if (!this.#gravity || now - this.#lastSample > 250) this.#gravity = [...sample];
      const blend = 1 - Math.exp(-dt / 0.35);
      const gravity = this.#gravity;
      linear = sample.map((value, axis) => {
        gravity[axis] += (value - gravity[axis]) * blend;
        return value - gravity[axis];
      });
    }
    const angle = ((screen.orientation?.angle ?? 0) * Math.PI) / 180;
    const acceleration = motionToWorld(
      finite(linear[0]),
      finite(linear[1]),
      finite(linear[2]),
      angle,
    );
    // rotationRate uses alpha, beta, gamma for X, Y, Z (unlike orientation angles).
    const rate = event.rotationRate;
    const radians = Math.PI / 180;
    const omega = motionToWorld(
      finite(rate?.alpha) * radians,
      finite(rate?.beta) * radians,
      finite(rate?.gamma) * radians,
      angle,
    );
    // Translation inertia plus rotational drag at the imaginary top point (0, .5, 0).
    this.acceleration.x = -acceleration.x * 0.7 + omega.z * 3;
    this.acceleration.y = -acceleration.y * 0.7;
    this.acceleration.z = -acceleration.z * 0.7 - omega.x * 3;
    const scale = Math.min(1, 18 / Math.hypot(...this.acceleration));
    for (let axis = 0; axis < 3; axis++) this.acceleration[axis] *= scale;
    this.#lastSample = now;
  };

  update() {
    if (performance.now() - this.#lastSample > 250)
      this.acceleration.x = this.acceleration.y = this.acceleration.z = 0;
  }

  destroy() {
    this.#disposed = true;
    window.removeEventListener('devicemotion', this.#onMotion);
    this.acceleration.x = this.acceleration.y = this.acceleration.z = 0;
  }
}
