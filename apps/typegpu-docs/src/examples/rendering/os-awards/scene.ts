import { d } from 'typegpu';

const environmentMipCount = 11;

export const scene = {
  camera: {
    awayFromStagePosition: d.vec4f(0, 0, 2, 1),
    target: d.vec4f(0, 0, 0, 1),
    minZoom: 0.5,
    maxZoom: 5,
  },
  display: {
    exposure: 0.77,
    gamma: d.vec3f(1 / 2.2),
  },
  award: {
    initialRotation: Math.PI / 4,
    autoRotationSpeed: 0.00025,
  },
  lighting: {
    dielectricF0: d.vec3f(0.04),
    directLights: [
      { direction: d.vec3f(-0.78, 0.37, 0.5), color: d.vec3f(0.32, 0.52, 1), strength: 0.85 },
      {
        direction: d.vec3f(-0.04, 0.18, 0.98),
        color: d.vec3f(0.45, 0.56, 1),
        strength: 0.38,
      },
      { direction: d.vec3f(0.03, 0.78, 0.62), color: d.vec3f(1, 0.68, 0.24), strength: 1.25 },
      { direction: d.vec3f(0.39, 0.67, 0.63), color: d.vec3f(1, 0.76, 0.32), strength: 0.45 },
    ],
    cameraFill: {
      color: d.vec3f(1, 0.96, 0.9),
      strength: 0.8,
    },
    ambientStrength: 0.3,
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
    warp: {
      frequency: 34,
      strength: 0.22,
    },
    tint: d.vec3f(0.9, 0.98, 1.05),
    albedoMix: 0.08,
    rimColor: d.vec3f(0.45, 0.65, 0.9),
    environmentSamples: [
      { weight: 0.62, bias: 0.45 },
      { weight: 0.28, bias: 1.2 },
      { weight: 0.1, bias: 2.2 },
    ],
    wood: {
      warm: d.vec3f(0.95, 0.72, 0.48),
      dark: d.vec3f(0.28, 0.13, 0.045),
    },
  },
} as const;
