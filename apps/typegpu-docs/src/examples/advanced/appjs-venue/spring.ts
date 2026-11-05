/**
 * Damped harmonic oscillator, approximating Reanimated's `withSpring`.
 */
export function createSpring(value: number, { stiffness = 100, dampingRatio = 0.5 } = {}) {
  const damping = 2 * dampingRatio * Math.sqrt(stiffness);
  return {
    value,
    velocity: 0,
    target: value,
    step(dt: number) {
      const acceleration = stiffness * (this.target - this.value) - damping * this.velocity;
      this.velocity += acceleration * dt;
      this.value += this.velocity * dt;
    },
  };
}
