import { d } from 'typegpu';

export type SpringProperties = {
  mass: number;
  stiffness: number;
  damping: number;
};

export class Spring {
  value: number;
  target: number;
  properties: SpringProperties;

  #velocity: number;

  constructor(properties: SpringProperties) {
    this.target = 0;
    this.value = this.target;
    this.properties = { ...properties };

    this.#velocity = 0;
  }

  update(dt: number) {
    if (dt <= 0 || !Number.isFinite(dt)) return;

    // Keep integration stable during slow frames while advancing the full timestep.
    const steps = Math.ceil(dt * 120);
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) {
      const F_spring = -this.properties.stiffness * (this.value - this.target);
      const F_damp = -this.properties.damping * this.#velocity;
      const a = (F_spring + F_damp) / this.properties.mass;
      this.#velocity = this.#velocity + a * stepDt;
      this.value = this.value + this.#velocity * stepDt;
    }
  }
}

/** One imaginary point, displaced from its rest position at the jelly's top. */
export class Spring3D {
  displacement = d.vec3f();
  velocity = d.vec3f();

  update(dt: number, acceleration: d.v3f) {
    if (dt <= 0 || !Number.isFinite(dt)) return;
    const steps = Math.ceil(Math.min(dt, 0.1) * 120);
    const h = Math.min(dt, 0.1) / steps;
    for (let step = 0; step < steps; step++) {
      for (let axis = 0; axis < 3; axis++) {
        this.velocity[axis] +=
          (acceleration[axis] - 110 * this.displacement[axis] - 7 * this.velocity[axis]) * h;
        this.displacement[axis] += this.velocity[axis] * h;
      }
      // Keep the deformation invertible and within the ray-marching bounds.
      const length = Math.hypot(...this.displacement);
      if (length > 0.16) {
        for (let axis = 0; axis < 3; axis++) this.displacement[axis] *= 0.16 / length;
        const outward =
          this.velocity.x * this.displacement.x +
          this.velocity.y * this.displacement.y +
          this.velocity.z * this.displacement.z;
        if (outward > 0) {
          for (let axis = 0; axis < 3; axis++) {
            this.velocity[axis] -= (outward * this.displacement[axis]) / (0.16 * 0.16);
          }
        }
      }
    }
  }
}
