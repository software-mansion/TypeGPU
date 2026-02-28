import type { TgpuRoot, TgpuUniform } from 'typegpu';
import * as std from 'typegpu/std';
import {
  squashXProperties,
  squashZProperties,
  SWITCH_ACCELERATION,
  wiggleXProperties,
} from './constants.ts';
import { SwitchState } from './dataTypes.ts';
import { Spring } from './spring.ts';

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
  #squelchBuffers: AudioBuffer[] | undefined;

  // Derived physical state
  #progress: number;
  #velocity: number;
  #squashXSpring: Spring;
  #squashZSpring: Spring;
  #wiggleXSpring: Spring;

  constructor(root: TgpuRoot) {
    this.#root = root;

    this.#progress = 0;
    this.#velocity = 0;
    this.#squashXSpring = new Spring(squashXProperties);
    this.#squashZSpring = new Spring(squashZProperties);
    this.#wiggleXSpring = new Spring(wiggleXProperties);

    this.stateUniform = this.#root.createUniform(SwitchState);

    // Initialize audio system
    this.#audioContext = new AudioContext();
    this.#backgroundGainNode = this.#audioContext.createGain();
    this.#backgroundGainNode.connect(this.#audioContext.destination);
    this.#backgroundGainNode.gain.value = 0;
  }

  async init() {
    const [backgroundResponse, switchOnResponse, switchOffResponse] = await Promise.all([
      fetch('/TypeGPU/assets/jelly-switch/drag-noise.ogg'),
      fetch('/TypeGPU/assets/jelly-switch/switch-on.ogg'),
      fetch('/TypeGPU/assets/jelly-switch/switch-off.ogg'),
    ]);

    this.#squelchBuffers = await Promise.all(
      Array.from({ length: 6 }, (_, idx) =>
        fetch(`/TypeGPU/assets/jelly-switch/squelch${idx + 1}.wav`)
          .then((res) => res.arrayBuffer())
          .then((buffer) => this.#audioContext.decodeAudioData(buffer)),
      ),
    );

    const [backgroundArrayBuffer, switchOnArrayBuffer, switchOffArrayBuffer] = await Promise.all([
      backgroundResponse.arrayBuffer(),
      switchOnResponse.arrayBuffer(),
      switchOffResponse.arrayBuffer(),
    ]);

    const [backgroundBuffer, switchOnBuffer, switchOffBuffer] = await Promise.all([
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
      this.#squashXSpring.velocity = -2;
      this.#squashZSpring.velocity = 1;
      this.#wiggleXSpring.velocity = 1 * Math.sign(this.#progress - 0.5);
    }

    this.#velocity = this.#velocity + acc * dt;
    if (this.#progress > 0 && this.#progress < 1) {
      this.#wiggleXSpring.velocity = this.#velocity;
    }

    this.#progress = this.#progress + this.#velocity * dt;
    // Overshoot
    if (this.#progress > 1) {
      this.#progress = 1;
      // Converting leftover velocity to compression
      this.#velocity = 0;
      this.#squashXSpring.velocity = -5;
      this.#squashZSpring.velocity = 5;
      this.#wiggleXSpring.velocity = -10;
      this.playSwitchOn();
    }
    if (this.#progress < 0) {
      this.#progress = 0;
      // Converting leftover velocity to compression
      this.#velocity = 0;
      this.#squashXSpring.velocity = -5;
      this.#squashZSpring.velocity = 5;
      this.#wiggleXSpring.velocity = 10;
      this.playSwitchOff();
    }
    this.#progress = std.saturate(this.#progress);

    // Spring dynamics
    this.#squashXSpring.update(dt);
    this.#squashZSpring.update(dt);
    this.#wiggleXSpring.update(dt);

    this.#backgroundGainNode.gain.value = std.saturate(std.abs(this.#velocity * 0.1)) * 5;
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
      squashX: this.#squashXSpring.value,
      squashZ: this.#squashZSpring.value,
      wiggleX: this.#wiggleXSpring.value,
    });
  }

  playSwitchOn() {
    if (!this.#switchOnBuffer) return;
    const source = this.#audioContext.createBufferSource();
    source.buffer = this.#switchOnBuffer;
    source.connect(this.#audioContext.destination);
    source.start();
    this.playSquelch();
  }

  playSwitchOff() {
    if (!this.#switchOffBuffer) return;
    const source = this.#audioContext.createBufferSource();
    source.buffer = this.#switchOffBuffer;
    source.connect(this.#audioContext.destination);
    source.start();
    this.playSquelch();
  }

  playSquelch() {
    const buffer = this.#squelchBuffers
      ? this.#squelchBuffers[Math.floor(Math.random() * this.#squelchBuffers.length)]
      : undefined;

    if (!buffer) return;
    const source = this.#audioContext.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1 + Math.random() * 0.5;
    const gainNode = this.#audioContext.createGain();
    gainNode.gain.value = 0.1;
    source.connect(gainNode);
    gainNode.connect(this.#audioContext.destination);
    source.start();
  }
}
