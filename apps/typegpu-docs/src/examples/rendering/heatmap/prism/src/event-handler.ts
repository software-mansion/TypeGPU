import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

import type { CameraConfig } from './types.ts';

export class EventHandler {
  #canvas: HTMLCanvasElement;
  #isDragging = false;
  #prevX = 0;
  #prevY = 0;
  #orbitRadius: number;
  #orbitYaw: number;
  #orbitPitch: number;
  #cameraConfig: CameraConfig;
  #cameraViewMatrix!: d.m4x4f;
  #cameraChanged = false;
  #handlersMap;

  constructor(canvas: HTMLCanvasElement, cameraConfig: CameraConfig) {
    this.#canvas = canvas;
    this.#cameraConfig = cameraConfig;

    const cameraPosition = cameraConfig.position;
    this.#orbitRadius = std.length(cameraPosition.xyz);
    this.#orbitYaw = Math.atan2(
      cameraPosition.x,
      cameraPosition.z,
    );
    this.#orbitPitch = Math.asin(
      cameraPosition.y / this.#orbitRadius,
    );

    this.#handlersMap = new Map();
  }

  setup() {
    const canvas = this.#canvas;
    const handlersMap = this.#handlersMap;

    handlersMap.set('contextmenu', this.#preventDefault.bind(this));
    canvas.addEventListener('contextmenu', handlersMap.get('contextmenu'));

    if (this.#cameraConfig.zoomable) {
      handlersMap.set('wheel', this.#wheelEventListener.bind(this));
      canvas.addEventListener('wheel', handlersMap.get('wheel'), {
        passive: false,
      });
    }

    if (this.#cameraConfig.draggable) {
      handlersMap.set('mousedown', this.#mouseDownEventListener.bind(this));
      canvas.addEventListener('mousedown', this.#handlersMap.get('mousedown'));

      handlersMap.set('mousemove', this.#mouseMoveEventListener.bind(this));
      canvas.addEventListener('mousemove', this.#handlersMap.get('mousemove'));

      handlersMap.set('mouseup', this.#mouseUpEventListener.bind(this));
      canvas.addEventListener('mouseup', this.#handlersMap.get('mouseup'));
    }
  }

  resetCameraChangedFlag() {
    this.#cameraChanged = false;
  }

  get cameraChanged() {
    return this.#cameraChanged;
  }

  get cameraViewMatrix() {
    return this.#cameraViewMatrix;
  }

  #getCoordinalesfromPolars(): d.v4f {
    const orbitRadius = this.#orbitRadius;
    const orbitYaw = this.#orbitYaw;
    const orbitPitch = this.#orbitPitch;

    return d.vec4f(
      orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch),
      orbitRadius * Math.sin(orbitPitch),
      orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch),
      1,
    );
  }

  #updateCameraOrbit(dx: number, dy: number) {
    const orbitYaw = this.#orbitYaw - dx * this.#cameraConfig.orbitSensitivity;
    const maxPitch = Math.PI / 2 - 0.01;
    const orbitPitch = std.clamp(
      this.#orbitPitch +
        dy * this.#cameraConfig.orbitSensitivity,
      -maxPitch,
      maxPitch,
    );

    const newCameraPos = this.#getCoordinalesfromPolars();
    const newView = m.mat4.lookAt(
      newCameraPos,
      this.#cameraConfig.target,
      this.#cameraConfig.up,
      d.mat4x4f(),
    );

    this.#orbitYaw = orbitYaw;
    this.#orbitPitch = orbitPitch;
    this.#cameraChanged = true;
    this.#cameraViewMatrix = newView;
  }

  #updateCameraZoom(dy: number): void {
    this.#orbitRadius = Math.max(
      this.#cameraConfig.maxZoom,
      this.#orbitRadius + dy * this.#cameraConfig.zoomSensitivity,
    );

    const newCameraPos = this.#getCoordinalesfromPolars();
    const newView = m.mat4.lookAt(
      newCameraPos,
      this.#cameraConfig.target,
      this.#cameraConfig.up,
      d.mat4x4f(),
    );

    this.#cameraChanged = true;
    this.#cameraViewMatrix = newView;
  }

  #preventDefault(event: Event) {
    event.preventDefault();
  }

  #mouseUpEventListener() {
    this.#isDragging = false;
  }

  #mouseMoveEventListener(event: MouseEvent) {
    if (!this.#isDragging) return;

    const dx = event.clientX - this.#prevX;
    const dy = event.clientY - this.#prevY;
    this.#prevX = event.clientX;
    this.#prevY = event.clientY;

    this.#updateCameraOrbit(dx, dy);
  }

  #mouseDownEventListener(event: MouseEvent) {
    if (event.button === 0) {
      this.#isDragging = true;
    }
    this.#prevX = event.clientX;
    this.#prevY = event.clientY;
  }

  #wheelEventListener(event: WheelEvent) {
    this.#preventDefault(event);
    this.#updateCameraZoom(event.deltaY);
  }

  destroy() {
    for (const [event, handler] of this.#handlersMap) {
      this.#canvas.removeEventListener(event, handler);
    }
  }
}
