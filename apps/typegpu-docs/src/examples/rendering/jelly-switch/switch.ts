import type { TgpuRoot, TgpuUniform } from 'typegpu';
import * as std from 'typegpu/std';
import {
  SPRING_X_DAMPING,
  SPRING_X_STIFFNESS,
  SPRING_Z_DAMPING,
  SPRING_Z_STIFFNESS,
  SWITCH_ACCELERATION,
} from './constants.ts';
import { SwitchState } from './dataTypes.ts';

export class SwitchBehavior {
  #root: TgpuRoot;

  stateUniform: TgpuUniform<typeof SwitchState>;

  // State
  toggled = false;

  // Derived physical state
  #progress: number;
  #squashX: number;
  #squashZ: number;
  #shockwavePosition: number;
  #shockwaveAmount: number;

  #velocity: number;
  #squashXVelocity: number;
  #squashZVelocity: number;

  constructor(root: TgpuRoot) {
    this.#root = root;

    this.#progress = 0;
    this.#squashX = 0;
    this.#squashZ = 0;
    this.#shockwavePosition = 0;
    this.#shockwaveAmount = 0;

    this.#velocity = 0;
    this.#squashXVelocity = 0;
    this.#squashZVelocity = 0;

    this.stateUniform = this.#root.createUniform(SwitchState);
  }

  update(dt: number) {
    if (dt <= 0) return;

    let acc = 0;
    if (this.toggled && this.#progress < 1) {
      acc = SWITCH_ACCELERATION;
    }
    if (!this.toggled && this.#progress > 0) {
      acc = -SWITCH_ACCELERATION;
    }

    this.#velocity = this.#velocity + acc * dt;

    this.#progress = this.#progress + this.#velocity * dt;
    // Overshoot
    if (this.#progress > 1) {
      this.#progress = 1;
      // Converting leftover velocity to compression
      this.#squashXVelocity = -5;
      this.#squashZVelocity = 5;
      this.#velocity = 0;
    }
    if (this.#progress < 0) {
      this.#progress = 0;
      // Converting leftover velocity to compression
      this.#squashXVelocity = -5;
      this.#squashZVelocity = 5;
      this.#velocity = 0;
    }
    this.#progress = std.saturate(this.#progress);

    // Spring dynamics
    {
      const mass = 1;
      const F_spring = -SPRING_X_STIFFNESS * (this.#squashX - 0);
      const F_damp = -SPRING_X_DAMPING * this.#squashXVelocity;
      const a = (F_spring + F_damp) / mass;
      this.#squashXVelocity = this.#squashXVelocity + a * dt;
      this.#squashX = this.#squashX +
        this.#squashXVelocity * dt;
    }
    {
      const mass = 1;
      const F_spring = -SPRING_Z_STIFFNESS * (this.#squashZ - 0);
      const F_damp = -SPRING_Z_DAMPING * this.#squashZVelocity;
      const a = (F_spring + F_damp) / mass;
      this.#squashZVelocity = this.#squashZVelocity + a * dt;
      this.#squashZ = this.#squashZ +
        this.#squashZVelocity * dt;
    }

    this.#updateGPUBuffer();
  }

  #updateGPUBuffer() {
    this.stateUniform.write({
      progress: this.#progress,
      squashX: this.#squashX,
      squashZ: this.#squashZ,
      shockwavePosition: this.#shockwavePosition,
      shockwaveAmount: this.#shockwaveAmount,
    });
  }
}
