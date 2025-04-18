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
] as const;
export type SphereTextureName = (typeof sphereTextureNames)[number];

export const presets = [
  'Asteroid belt',
  'Asteroid belt with collisions',
  'Test 0',
  'Test 1',
  'Test 2',
  'Test 3',
  'Test 4',
  'Test 5',
  'Test 6',
] as const;
export type Preset = (typeof presets)[number];
