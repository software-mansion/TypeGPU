export const collisionBehavior = ['none', 'bouncy', 'merge'] as const;
export type CollisionBehavior = (typeof collisionBehavior)[number];

export type SkyBox = 'campsite' | 'beach' | 'milky-way';

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
  'Asteroids',
  'Colliding asteroids',
  'Bouncy dust',
  'Merging dust',
  'Solar System',
] as const;
export type Preset = (typeof presets)[number];
