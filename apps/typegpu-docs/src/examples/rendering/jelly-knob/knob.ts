import type { TgpuRoot, TgpuUniform } from 'typegpu';
import * as std from 'typegpu/std';
import { twistProperties } from './constants.ts';
import { KnobState } from './dataTypes.ts';
import { Spring } from './spring.ts';

export class KnobBehavior {
  stateUniform: TgpuUniform<typeof KnobState>;

  // State
  toggled = false;
  pressed = false;

  // Audio system
  // #audioContext: AudioContext;
  // #backgroundGainNode: GainNode;
  // #backgroundSource: AudioBufferSourceNode | undefined;
  // #switchOnBuffer: AudioBuffer | undefined;
  // #switchOffBuffer: AudioBuffer | undefined;

  // Derived physical state
  #progress: number;
  #twistSpring: Spring;

  constructor(root: TgpuRoot) {
    this.#progress = 0;
    this.#twistSpring = new Spring(twistProperties);

    this.stateUniform = root.createUniform(KnobState);

    // Initialize audio system
    // this.#audioContext = new AudioContext();
    // this.#backgroundGainNode = this.#audioContext.createGain();
    // this.#backgroundGainNode.connect(this.#audioContext.destination);
    // this.#backgroundGainNode.gain.value = 0;
  }

  get progress(): number {
    return this.#progress;
  }

  set progress(value: number) {
    this.#progress = std.saturate(value);
  }

  async init() {
    // const [backgroundResponse, switchOnResponse, switchOffResponse] =
    //   await Promise.all([
    //     fetch('/TypeGPU/assets/jelly-knob/drag-noise.ogg'),
    //     fetch('/TypeGPU/assets/jelly-knob/switch-on.ogg'),
    //     fetch('/TypeGPU/assets/jelly-knob/switch-off.ogg'),
    //   ]);

    // const [backgroundArrayBuffer, switchOnArrayBuffer, switchOffArrayBuffer] =
    //   await Promise.all([
    //     backgroundResponse.arrayBuffer(),
    //     switchOnResponse.arrayBuffer(),
    //     switchOffResponse.arrayBuffer(),
    //   ]);

    // const [backgroundBuffer, switchOnBuffer, switchOffBuffer] = await Promise
    //   .all([
    //     this.#audioContext.decodeAudioData(backgroundArrayBuffer),
    //     this.#audioContext.decodeAudioData(switchOnArrayBuffer),
    //     this.#audioContext.decodeAudioData(switchOffArrayBuffer),
    //   ]);

    // this.#switchOnBuffer = switchOnBuffer;
    // this.#switchOffBuffer = switchOffBuffer;

    // const source = this.#audioContext.createBufferSource();
    // source.buffer = backgroundBuffer;
    // source.loop = true;
    // source.connect(this.#backgroundGainNode);
    // source.start();
    // this.#backgroundSource = source;
  }

  update(dt: number) {
    if (dt <= 0) return;

    this.#twistSpring.target = this.#progress;
    this.#twistSpring.update(dt);

    this.#updateGPUBuffer();
  }

  #updateGPUBuffer() {
    this.stateUniform.write({
      topProgress: this.#progress,
      bottomProgress: this.#twistSpring.value,
      time: Date.now() / 1000 % 1000,
    });
  }
}
