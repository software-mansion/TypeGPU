import { d } from 'typegpu';

const environmentMipCount = 11;

export const scene = {
  camera: {
    awayFromStagePosition: d.vec4f(-1, 0, 2.5, 1),
    target: d.vec4f(0, 0, 0, 1),
    minZoom: 1,
    maxZoom: 3,
  },
  display: {
    exposure: 0.67,
    gamma: d.vec3f(1 / 2.2),
  },
  award: {
    initialRotation: Math.PI / 4,
    autoRotationSpeed: 0.00025,
  },
  lighting: {
    dielectricF0: d.vec3f(0.03),
    directLights: [
      { direction: d.vec3f(0, 0, 1), color: d.vec3f(0.32, 0.52, 1), strength: 1.1 },
      { direction: d.vec3f(0.36, 0.74, 0.57), color: d.vec3f(1, 0.68, 0.24), strength: 1.25 },
      { direction: d.vec3f(-0.36, 0.74, 0.57), color: d.vec3f(1, 0.76, 0.32), strength: 1.45 },
    ],
    cameraFill: {
      color: d.vec3f(1, 0.96, 0.9),
      strength: 0.8,
    },
    ambientStrength: 0.2,
    venueBounce: {
      color: d.vec3f(1, 0.58, 0.36),
      strength: 0.15,
    },
  },
  environment: {
    irradianceMipBias: environmentMipCount - 2,
    maxSpecularMipBias: environmentMipCount - 6,
  },
  epoxy: {
    bounds: {
      min: d.vec3f(-0.02, -0.16, -0.17),
      max: d.vec3f(0.02, 0.28, 0.17),
    },
    warp: { frequency: 2 },
    columnDistortion: {
      edgeColumns: 6,
      faceColumns: 3,
      waveFrequency: 10,
      waveSkew: 1.542,
      wavePower: 0.4,
      waveStrength: 0.2,
      viewPull: -0.4,
      mipBiasBase: 2,
      mipBiasAlignmentScale: 4,
    },
    tint: d.vec3f(0.9, 0.98, 1.05),
    albedoMix: 0.08,
    wood: {
      warm: d.vec3f(0.95, 0.72, 0.48),
      dark: d.vec3f(0.28, 0.13, 0.045),
    },
  },
} as const;
