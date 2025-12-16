import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  try {
    const filesetResolver = await FilesetResolver.forVisionTasks('/wasm');

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
