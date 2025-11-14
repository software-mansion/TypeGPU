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
    const F_spring = -this.properties.stiffness * (this.value - this.target);
    const F_damp = -this.properties.damping * this.#velocity;
    const a = (F_spring + F_damp) / this.properties.mass;
    this.#velocity = this.#velocity + a * dt;
    this.value = this.value + this.#velocity * dt;
  }
}
