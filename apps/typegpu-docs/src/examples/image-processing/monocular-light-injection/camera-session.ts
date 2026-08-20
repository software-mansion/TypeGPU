import { d } from 'typegpu';

interface CameraSchedule {
  readonly kind: 'video-frame' | 'animation-frame';
  readonly handle: number;
}

export interface DepthCameraFrame {
  readonly source: HTMLVideoElement | VideoFrame;
  readonly uvTransform: d.m2x2f;
  readonly swapAxes: boolean;
}

export interface DepthCameraSessionCallbacks {
  readonly onFrame: (frame: DepthCameraFrame) => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
  readonly onEnded?: () => void;
}

export type DepthCameraFacing = 'user' | 'environment';

export interface DepthCameraSessionOptions {
  /** Caps capture rate so the camera cannot outrun what inference consumes */
  readonly frameRate?: number;
  readonly facingMode?: DepthCameraFacing;
}

const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

type FrameTransform = Pick<DepthCameraFrame, 'uvTransform' | 'swapAxes'>;

const UPRIGHT_TRANSFORM: FrameTransform = {
  uvTransform: d.mat2x2f.identity(),
  swapAxes: false,
};

/** Only iOS hands the capture over in the device's own orientation */
const IOS_TRANSFORMS: Partial<Record<OrientationType, FrameTransform>> = {
  'portrait-primary': { uvTransform: d.mat2x2f(0, -1, 1, 0), swapAxes: true },
  'portrait-secondary': { uvTransform: d.mat2x2f(0, 1, -1, 0), swapAxes: true },
  'landscape-primary': { uvTransform: d.mat2x2f(-1, 0, 0, -1), swapAxes: false },
};

function frameTransform(): FrameTransform {
  const orientation = screen.orientation?.type;
  if (!IS_IOS || !orientation) {
    return UPRIGHT_TRANSFORM;
  }
  return IOS_TRANSFORMS[orientation] ?? UPRIGHT_TRANSFORM;
}

/** Owns camera tracks, orientation, and the strictly serial video-frame scheduler */
export class DepthCameraSession {
  readonly #video: HTMLVideoElement;
  readonly #callbacks: DepthCameraSessionCallbacks;
  readonly #frameRate: number | undefined;
  #facingMode: DepthCameraFacing;
  #generation = 0;
  #starting = false;
  #stream: MediaStream | undefined;
  #schedule: CameraSchedule | undefined;
  #frameTask: Promise<void> | undefined;
  #disposed = false;

  constructor(
    video: HTMLVideoElement,
    callbacks: DepthCameraSessionCallbacks,
    options: DepthCameraSessionOptions = {},
  ) {
    this.#video = video;
    this.#callbacks = callbacks;
    this.#frameRate = options.frameRate;
    this.#facingMode = options.facingMode ?? 'environment';
  }

  get facingMode(): DepthCameraFacing {
    return this.#facingMode;
  }

  /** Takes effect on the next start, so a running session must be restarted */
  set facingMode(value: DepthCameraFacing) {
    this.#facingMode = value;
  }

  get active(): boolean {
    return this.#starting || this.#stream !== undefined;
  }

  static get available(): boolean {
    return navigator.mediaDevices?.getUserMedia !== undefined;
  }

  async start(): Promise<void> {
    if (this.active) {
      return;
    }
    if (!DepthCameraSession.available) {
      throw new Error('Camera capture is unavailable in this browser or page context.');
    }

    const generation = ++this.#generation;
    this.#starting = true;
    let nextStream: MediaStream | undefined;
    try {
      const constraints: MediaTrackConstraints = {
        facingMode: { ideal: this.#facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };
      if (this.#frameRate !== undefined) {
        constraints.frameRate = { ideal: this.#frameRate, max: this.#frameRate };
      }
      nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: constraints,
      });
      if (!this.#isCurrent(generation)) {
        this.#stopTracks(nextStream);
        return;
      }

      this.#stream = nextStream;
      nextStream = undefined;
      this.#video.srcObject = this.#stream;
      await this.#video.play();
      if (!this.#isCurrent(generation) || !this.#stream) {
        return;
      }

      this.#starting = false;
      this.#video.hidden = false;
      for (const track of this.#stream.getVideoTracks()) {
        track.addEventListener(
          'ended',
          () => {
            if (this.#isCurrent(generation) && this.#stream) {
              this.#release();
              this.#callbacks.onEnded?.();
            }
          },
          { once: true },
        );
      }
      this.#scheduleFrame(generation);
    } catch (error) {
      this.#stopTracks(nextStream);
      if (this.#isCurrent(generation)) {
        this.#release();
      }
      throw error;
    } finally {
      if (this.#isCurrent(generation) && this.#starting) {
        this.#starting = false;
      }
    }
  }

  async stop(): Promise<void> {
    const inFlight = this.#frameTask;
    this.#release();
    await inFlight?.catch(() => undefined);
  }

  async destroy(): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    await this.stop();
  }

  #scheduleFrame(generation: number): void {
    if (!this.#isRunning(generation) || this.#schedule || this.#frameTask) {
      return;
    }

    const run = (sourceWidth: number, sourceHeight: number): void => {
      this.#schedule = undefined;
      if (!this.#isRunning(generation) || sourceWidth <= 0 || sourceHeight <= 0) {
        return;
      }
      let task: Promise<void>;
      try {
        task = Promise.resolve(
          this.#callbacks.onFrame({
            source: this.#video,
            ...frameTransform(),
          }),
        );
      } catch (error) {
        this.#release();
        this.#callbacks.onError?.(error);
        return;
      }
      this.#frameTask = task;
      void task
        .catch((error: unknown) => {
          if (this.#isRunning(generation)) {
            this.#release();
            this.#callbacks.onError?.(error);
          }
        })
        .finally(() => {
          if (this.#frameTask === task) {
            this.#frameTask = undefined;
          }
          this.#scheduleFrame(generation);
        });
    };

    if (this.#video.requestVideoFrameCallback) {
      const handle = this.#video.requestVideoFrameCallback((_now, metadata) =>
        run(metadata.width, metadata.height),
      );
      this.#schedule = { kind: 'video-frame', handle };
      return;
    }
    this.#schedule = {
      kind: 'animation-frame',
      handle: requestAnimationFrame(() => run(this.#video.videoWidth, this.#video.videoHeight)),
    };
  }

  #release(): void {
    this.#generation += 1;
    this.#starting = false;
    this.#cancelSchedule();
    const stream = this.#stream;
    this.#stream = undefined;
    this.#video.pause();
    this.#video.srcObject = null;
    this.#video.hidden = true;
    this.#stopTracks(stream);
  }

  #cancelSchedule(): void {
    const schedule = this.#schedule;
    this.#schedule = undefined;
    if (schedule?.kind === 'video-frame') {
      this.#video.cancelVideoFrameCallback(schedule.handle);
    } else if (schedule) {
      cancelAnimationFrame(schedule.handle);
    }
  }

  #stopTracks(stream: MediaStream | undefined): void {
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
  }

  #isCurrent(generation: number): boolean {
    return !this.#disposed && generation === this.#generation;
  }

  #isRunning(generation: number): boolean {
    return this.#isCurrent(generation) && this.#stream !== undefined;
  }
}
