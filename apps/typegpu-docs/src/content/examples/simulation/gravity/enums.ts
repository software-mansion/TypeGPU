export type CollisionBehavior = 'none' | 'bouncy' | 'merge';

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
export type SphereTextureNames = (typeof sphereTextureNames)[number];

export const presets = [
  'Asteroid belt',
  'Test 0',
  'Test 1',
  'Test 2',
  'Test 3',
  'Test 4',
  'Test 5',
] as const;
export type Preset = (typeof presets)[number];
