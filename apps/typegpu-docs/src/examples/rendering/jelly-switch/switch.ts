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

  // Audio system
  #audioContext: AudioContext;
  #backgroundGainNode: GainNode;
  #backgroundSource: AudioBufferSourceNode | undefined;
  #switchOnBuffer: AudioBuffer | undefined;
  #switchOffBuffer: AudioBuffer | undefined;

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

    // Initialize audio system
    this.#audioContext = new AudioContext();
    this.#backgroundGainNode = this.#audioContext.createGain();
    this.#backgroundGainNode.connect(this.#audioContext.destination);
    this.#backgroundGainNode.gain.value = 0;
  }

  async init() {
    const [backgroundResponse, switchOnResponse, switchOffResponse] =
      await Promise.all([
        fetch('/TypeGPU/assets/jelly-switch/drag-noise.ogg'),
        fetch('/TypeGPU/assets/jelly-switch/switch-on.ogg'),
        fetch('/TypeGPU/assets/jelly-switch/switch-off.ogg'),
      ]);

    const [backgroundArrayBuffer, switchOnArrayBuffer, switchOffArrayBuffer] =
      await Promise.all([
        backgroundResponse.arrayBuffer(),
        switchOnResponse.arrayBuffer(),
        switchOffResponse.arrayBuffer(),
      ]);

    const [backgroundBuffer, switchOnBuffer, switchOffBuffer] = await Promise
      .all([
        this.#audioContext.decodeAudioData(backgroundArrayBuffer),
        this.#audioContext.decodeAudioData(switchOnArrayBuffer),
        this.#audioContext.decodeAudioData(switchOffArrayBuffer),
      ]);

    this.#switchOnBuffer = switchOnBuffer;
    this.#switchOffBuffer = switchOffBuffer;

    const source = this.#audioContext.createBufferSource();
    source.buffer = backgroundBuffer;
    source.loop = true;
    source.connect(this.#backgroundGainNode);
    source.start();
    this.#backgroundSource = source;
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
      this.playSwitchOn();
    }
    if (this.#progress < 0) {
      this.#progress = 0;
      // Converting leftover velocity to compression
      this.#velocity = 0;
      this.#squashXVelocity = -5;
      this.#squashZVelocity = 5;
      this.#wiggleXVelocity = 10;
      this.playSwitchOff();
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

    this.#backgroundGainNode.gain.value = std.saturate(
      std.abs(this.#velocity * 0.1),
    ) * 5;
    this.#backgroundSource?.playbackRate.setTargetAtTime(
      std.abs(this.#velocity) * 0.02 + 0.8,
      0,
      0.02,
    );
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

  playSwitchOn() {
    if (!this.#switchOnBuffer) return;
    const source = this.#audioContext.createBufferSource();
    source.buffer = this.#switchOnBuffer;
    source.connect(this.#audioContext.destination);
    source.start();
  }

  playSwitchOff() {
    if (!this.#switchOffBuffer) return;
    const source = this.#audioContext.createBufferSource();
    source.buffer = this.#switchOffBuffer;
    source.connect(this.#audioContext.destination);
    source.start();
  }
}
