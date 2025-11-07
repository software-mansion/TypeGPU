import type { TgpuRoot, TgpuUniform } from 'typegpu';
import * as std from 'typegpu/std';
import { SwitchState } from './dataTypes.ts';
import { SWITCH_ACCELERATION } from './constants.ts';

export class SwitchBehavior {
  #root: TgpuRoot;

  stateUniform: TgpuUniform<typeof SwitchState>;

  // Physics parameters
  iterations = 16;
  substeps = 6;
  damping = 0.01;
  bendingStrength = 0.1;
  archStrength = 2;
  endFlatCount = 1;
  endFlatStiffness = 0.05;
  bendingExponent = 1.2;
  archEdgeDeadzone = 0.01;

  // State
  toggled = false;

  // Derived physical state
  #progress: number;
  #squashAndStretch: number;
  #shockwavePosition: number;
  #shockwaveAmount: number;
  #velocity: number;

  constructor(root: TgpuRoot) {
    this.#root = root;

    this.#progress = 0;
    this.#squashAndStretch = 0;
    this.#shockwavePosition = 0;
    this.#shockwaveAmount = 0;
    this.#velocity = 0;

    this.stateUniform = this.#root.createUniform(SwitchState);
  }

  update(dt: number) {
    if (dt <= 0) return;

    const targetX = this.toggled ? 1 : 0;
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
      this.#squashAndStretch = 1;
      this.#velocity = 0;
    }
    if (this.#progress < 0) {
      this.#progress = 0;
      // Converting leftover velocity to compression
      this.#squashAndStretch = 1;
      this.#velocity = 0;
    }
    this.#progress = std.saturate(this.#progress);

    this.#updateGPUBuffer();
  }

  #updateGPUBuffer() {
    this.stateUniform.write({
      progress: this.#progress,
      squashAndStretch: this.#squashAndStretch,
      shockwavePosition: this.#shockwavePosition,
      shockwaveAmount: this.#shockwaveAmount,
    });
  }
}
