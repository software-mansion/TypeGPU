export const collisionBehaviors = {
  none: 0,
  bounce: 1,
  merge: 2,
} as const;
export type CollisionBehavior = keyof typeof collisionBehaviors;

export const sphereTextureNames = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'moon',
  'ceres-fictional',
  'haumea-fictional',
] as const;
export type SphereTextureName = (typeof sphereTextureNames)[number];

export const presets = [
  'Solar System',
  'Asteroids',
  'Colliding asteroids',
  'Bouncy dust',
  'Merging dust',
] as const;
export type Preset = (typeof presets)[number];
