import { d, std, type TgpuRoot, type TgpuUniform } from 'typegpu';
import { twistProperties } from './constants.ts';
import { KnobState } from './dataTypes.ts';
import { Spring, Spring3D } from './spring.ts';

export class KnobBehavior {
  stateUniform: TgpuUniform<typeof KnobState>;

  // State
  pressed = false;
  motionAcceleration = d.vec3f();
  #topSpring = new Spring3D();

  // Derived physical state
  #progress: number;
  #twistSpring: Spring;

  constructor(root: TgpuRoot) {
    this.#progress = 0;
    this.#twistSpring = new Spring(twistProperties);

    this.stateUniform = root.createUniform(KnobState);
  }

  get progress(): number {
    return this.#progress;
  }

  set progress(value: number) {
    this.#progress = std.saturate(value);
  }

  update(dt: number) {
    if (dt <= 0) return;

    this.#topSpring.update(dt, this.motionAcceleration);
    this.#twistSpring.target = this.#progress;
    this.#twistSpring.update(dt);

    this.#updateGPUBuffer();
  }

  #updateGPUBuffer() {
    this.stateUniform.write({
      topDisplacement: this.#topSpring.displacement,
      topProgress: this.#progress,
      bottomProgress: this.#twistSpring.value,
    });
  }
}
