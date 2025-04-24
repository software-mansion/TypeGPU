export const collisionBehaviors = ['none', 'bounce', 'merge'] as const;
export type CollisionBehavior = (typeof collisionBehaviors)[number];

export type SkyBox = 'milky-way';

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
