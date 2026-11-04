/** Colors of the three plums from the mascot drawings, shared by the 3D plums and the page */
export const PLUM_PALETTES = [
  // Green
  {
    bodyTop: 0xd6e57f,
    bodyBottom: 0x2a9ea3,
    ringTop: 0x1f9aa6,
    ringBottom: 0xc9df7c,
    tailTop: 0xf1ec7a,
    tailBottom: 0xa9d47c,
  },
  // Red
  {
    bodyTop: 0xf7a744,
    bodyBottom: 0xd0176c,
    ringTop: 0xd3156b,
    ringBottom: 0xf7a744,
    tailTop: 0xfab84a,
    tailBottom: 0xf08a4a,
  },
  // Blue
  {
    bodyTop: 0x8edcff,
    bodyBottom: 0x4787ff,
    ringTop: 0x4d86ff,
    ringBottom: 0x8adfff,
    tailTop: 0x93e3ff,
    tailBottom: 0x7cc8ff,
  },
] as const;

export type PlumPalette = (typeof PLUM_PALETTES)[number];

export const toCssHex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
