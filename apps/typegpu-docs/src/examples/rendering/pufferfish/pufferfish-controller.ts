import {
  FaceLandmarker,
  type FaceLandmarkerResult,
  FilesetResolver,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { PUCKER_THRESHOLD } from './constants.ts';
import { Spring } from './spring.ts';

const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MOUTH_PUCKER_CATEGORY = 'mouthPucker';

async function createFaceLandmarker(): Promise<FaceLandmarker> {
  try {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      '/TypeGPU/assets/pufferfish',
    );

    return await FaceLandmarker.createFromOptions(
      filesetResolver,
      {
        baseOptions: {
          modelAssetPath: MODEL_PATH,
          delegate: 'GPU',
        },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
      },
    );
  } catch (err) {
    alert(
      "Couldn't initialize the MediaPipe module (AI). Please make sure your device can handle on-device inference.",
    );
    throw err;
  }
}

function extractPuffScore(
  results: FaceLandmarkerResult,
): number {
  if (!results.faceBlendshapes || results.faceBlendshapes.length === 0) {
    return 0;
  }

  const mouthPucker = results.faceBlendshapes[0].categories.find(
    ({ categoryName }) => categoryName === MOUTH_PUCKER_CATEGORY,
  );

  if (!mouthPucker) {
    return 0;
  }

  return mouthPucker.score;
}

export type LandmarkBoundingBox = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type LandmarkCoord = {
  x: number;
  y: number;
};

export type FaceLandmarks = {
  nose: LandmarkCoord;
  leftEye: LandmarkCoord;
  rightEye: LandmarkCoord;
  faceOval: LandmarkBoundingBox;
};

/** Calculates bounding box of the given set of landmark indexes. */
export function calcBoundingBox(
  landmarks: NormalizedLandmark[],
  points: number[],
): LandmarkBoundingBox {
  let xMin = Infinity;
  let xMax = -Infinity;

  let yMin = Infinity;
  let yMax = -Infinity;

  for (const i of points) {
    const x = landmarks[i]?.x;
    const y = landmarks[i]?.y;

    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }

  return { xMin, xMax, yMin, yMax };
}

/** Returns 2d coordinate of the given landmark. */
export function get2dCoord(
  normalizedLandmark: NormalizedLandmark,
): LandmarkCoord {
  const { x, y } = normalizedLandmark;
  return { x, y };
}

const LANDMARK_NOSE = 4;
const LANDMARK_LEFT_EYE = 468;
const LANDMARK_RIGHT_EYE = 473;

function extractFaceLandmarks(landmarks: NormalizedLandmark[]): FaceLandmarks {
  const faceOvalPoints = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL.map(
    ({ start }) => start,
  );

  const faceOval = calcBoundingBox(landmarks, faceOvalPoints);
  const nose = get2dCoord(landmarks[LANDMARK_NOSE]);
  const leftEye = get2dCoord(landmarks[LANDMARK_LEFT_EYE]);
  const rightEye = get2dCoord(landmarks[LANDMARK_RIGHT_EYE]);

  return {
    nose,
    leftEye,
    rightEye,
    faceOval,
  };
}

export class PufferfishController {
  #faceLandmarker: FaceLandmarker;
  sizeSpring: Spring;
  faceLandmarks: FaceLandmarks | undefined;

  constructor(faceLandmarker: FaceLandmarker) {
    this.#faceLandmarker = faceLandmarker;
    this.sizeSpring = new Spring({ damping: 10, mass: 1, stiffness: 1000 });
  }

  updatePuffScore(
    videoElement: HTMLVideoElement,
  ): void {
    const results = this.#faceLandmarker.detectForVideo(
      videoElement,
      performance.now(),
    );

    const score = extractPuffScore(results);
    this.sizeSpring.target = score > PUCKER_THRESHOLD ? 1 : 0;

    if (results.faceLandmarks[0]) {
      const faceLandmarks = extractFaceLandmarks(results.faceLandmarks[0]);
      this.faceLandmarks = faceLandmarks;
    }
  }

  update(dt: number) {
    this.sizeSpring.update(dt);
  }
}

export async function createPufferfishController(): Promise<
  PufferfishController
> {
  const faceLandmarker = await createFaceLandmarker();
  return new PufferfishController(faceLandmarker);
}
