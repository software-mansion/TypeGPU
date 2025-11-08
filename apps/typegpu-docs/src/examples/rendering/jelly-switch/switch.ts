import type { TgpuRoot, TgpuUniform } from 'typegpu';
import * as std from 'typegpu/std';
import {
  SQUASH_X_DAMPING,
  SQUASH_X_STIFFNESS,
  SQUASH_Z_DAMPING,
  SQUASH_Z_STIFFNESS,
  SWITCH_ACCELERATION,
  WIGGLE_X_DAMPING,
  WIGGLE_X_STIFFNESS,
} from './constants.ts';
import { SwitchState } from './dataTypes.ts';

export class SwitchBehavior {
  #root: TgpuRoot;

  stateUniform: TgpuUniform<typeof SwitchState>;

  // State
  toggled = false;
  pressed = false;

  // Derived physical state
  #progress: number;
  #squashX: number;
  #squashZ: number;
  #wiggleX: number;
  #shockwavePosition: number;
  #shockwaveAmount: number;

  #velocity: number;
  #squashXVelocity: number;
  #squashZVelocity: number;
  #wiggleXVelocity: number;

  constructor(root: TgpuRoot) {
    this.#root = root;

    this.#progress = 0;
    this.#squashX = 0;
    this.#squashZ = 0;
    this.#wiggleX = 0;
    this.#shockwavePosition = 0;
    this.#shockwaveAmount = 0;

    this.#velocity = 0;
    this.#squashXVelocity = 0;
    this.#squashZVelocity = 0;
    this.#wiggleXVelocity = 0;

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

    // Anticipating movement
    if (this.pressed) {
      this.#squashXVelocity = -2;
      this.#squashZVelocity = 1;
      this.#wiggleXVelocity = 1 * Math.sign(this.#progress - 0.5);
    }

    this.#velocity = this.#velocity + acc * dt;
    if (this.#progress > 0 && this.#progress < 1) {
      this.#wiggleXVelocity = this.#velocity;
    }

    this.#progress = this.#progress + this.#velocity * dt;
    // Overshoot
    if (this.#progress > 1) {
      this.#progress = 1;
      // Converting leftover velocity to compression
      this.#velocity = 0;
      this.#squashXVelocity = -5;
      this.#squashZVelocity = 5;
      this.#wiggleXVelocity = -10;
    }
    if (this.#progress < 0) {
      this.#progress = 0;
      // Converting leftover velocity to compression
      this.#velocity = 0;
      this.#squashXVelocity = -5;
      this.#squashZVelocity = 5;
      this.#wiggleXVelocity = 10;
    }
    this.#progress = std.saturate(this.#progress);

    // Spring dynamics
    {
      const mass = 1;
      const F_spring = -SQUASH_X_STIFFNESS * (this.#squashX - 0);
      const F_damp = -SQUASH_X_DAMPING * this.#squashXVelocity;
      const a = (F_spring + F_damp) / mass;
      this.#squashXVelocity = this.#squashXVelocity + a * dt;
      this.#squashX = this.#squashX +
        this.#squashXVelocity * dt;
    }
    {
      const mass = 1;
      const F_spring = -SQUASH_Z_STIFFNESS * (this.#squashZ - 0);
      const F_damp = -SQUASH_Z_DAMPING * this.#squashZVelocity;
      const a = (F_spring + F_damp) / mass;
      this.#squashZVelocity = this.#squashZVelocity + a * dt;
      this.#squashZ = this.#squashZ +
        this.#squashZVelocity * dt;
    }
    {
      const mass = 1;
      const F_spring = -WIGGLE_X_STIFFNESS * (this.#wiggleX - 0);
      const F_damp = -WIGGLE_X_DAMPING * this.#wiggleXVelocity;
      const a = (F_spring + F_damp) / mass;
      this.#wiggleXVelocity = this.#wiggleXVelocity + a * dt;
      this.#wiggleX = this.#wiggleX +
        this.#wiggleXVelocity * dt;
    }

    this.#updateGPUBuffer();
  }

  #updateGPUBuffer() {
    this.stateUniform.write({
      progress: this.#progress,
      squashX: this.#squashX,
      squashZ: this.#squashZ,
      wiggleX: this.#wiggleX,
      shockwavePosition: this.#shockwavePosition,
      shockwaveAmount: this.#shockwaveAmount,
    });
  }
}
