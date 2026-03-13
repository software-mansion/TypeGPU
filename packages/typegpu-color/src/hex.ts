import tgpu, { d } from 'typegpu';
import { rgbToOklab } from './oklab.ts';

export const hexToRgb = tgpu.comptime((hex: string | number): d.v3f => {
  let h: number;
  if (typeof hex === 'string') {
    let normalized = hex.trim();
    if (normalized.startsWith('#')) {
      normalized = normalized.slice(1);
    }
    // Allow 6-digit (RRGGBB) or 8-digit (RRGGBBAA) hex strings.
    if (normalized.length !== 6 && normalized.length !== 8) {
      throw new Error(`hexToRgb expected a 6- or 8-digit hex string, got "${hex}".`);
    }
    // For 8-digit input, drop the alpha channel and keep RRGGBB.
    if (normalized.length === 8) {
      normalized = normalized.slice(0, 6);
    }
    h = Number.parseInt(normalized, 16);
    if (Number.isNaN(h)) {
      throw new Error(`hexToRgb could not parse hex string "${hex}".`);
    }
  } else {
    h = hex;
    if (!Number.isFinite(h)) {
      throw new Error(`hexToRgb expected a finite numeric value, got ${hex}.`);
    }
  }
  return d.vec3f((h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff).div(255);
});

export const hexToRgba = tgpu.comptime((hex: string | number): d.v4f => {
  let h: number;
  if (typeof hex === 'string') {
    let normalized = hex.trim();
    if (normalized.startsWith('#')) {
      normalized = normalized.slice(1);
    }
    // Allow 6-digit (RRGGBB) or 8-digit (RRGGBBAA) hex strings.
    // For 6-digit input, assume an implicit fully opaque alpha (FF).
    if (normalized.length === 6) {
      normalized = normalized + 'ff';
    } else if (normalized.length !== 8) {
      throw new Error(`hexToRgba expected a 6- or 8-digit hex string, got "${hex}".`);
    }
    h = Number.parseInt(normalized, 16);
    if (Number.isNaN(h)) {
      throw new Error(`hexToRgba could not parse hex string "${hex}".`);
    }
  } else {
    h = hex;
    if (!Number.isFinite(h)) {
      throw new Error(`hexToRgba expected a finite numeric value, got ${hex}.`);
    }
  }
  return d.vec4f((h >> 24) & 0xff, (h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff).div(255);
});

export const hexToOklab = tgpu.comptime((hex: string | number): d.v3f => {
  return rgbToOklab(hexToRgb(hex));
});
