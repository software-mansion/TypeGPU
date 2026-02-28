import { describe, expect, it } from 'vitest';
import { getTextureFormatInfo } from '../src/core/texture/textureFormats.ts';
import { f32, i32, u32 } from '../src/data/numeric.ts';
import { vec4f, vec4i, vec4u } from '../src/data/vector.ts';

describe('getTextureFormatInfo', () => {
  describe('8-bit formats', () => {
    it.each([
      ['r8unorm', 1, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['r8snorm', 1, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['r8uint', 1, u32, vec4u, ['uint'], true],
      ['r8sint', 1, i32, vec4i, ['sint'], true],
      ['rg8unorm', 2, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rg8snorm', 2, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rg8uint', 2, u32, vec4u, ['uint'], true],
      ['rg8sint', 2, i32, vec4i, ['sint'], true],
      ['rgba8unorm', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rgba8unorm-srgb', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rgba8snorm', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rgba8uint', 4, u32, vec4u, ['uint'], true],
      ['rgba8sint', 4, i32, vec4i, ['sint'], true],
      ['bgra8unorm', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['bgra8unorm-srgb', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
    ] as const)(
      '%s has texelSize=%d, channelType=%s, canRenderAttachment=%s',
      (format, texelSize, channelType, vectorType, sampleTypes, canRenderAttachment) => {
        const info = getTextureFormatInfo(format);
        expect(info.texelSize).toBe(texelSize);
        expect(info.channelType).toBe(channelType);
        expect(info.vectorType).toBe(vectorType);
        expect(info.sampleTypes).toEqual(sampleTypes);
        expect(info.canRenderAttachment).toBe(canRenderAttachment);
      },
    );
  });

  describe('16-bit formats', () => {
    it.each([
      ['r16unorm', 2, f32, vec4f, ['unfilterable-float'], true],
      ['r16snorm', 2, f32, vec4f, ['unfilterable-float'], true],
      ['r16uint', 2, u32, vec4u, ['uint'], true],
      ['r16sint', 2, i32, vec4i, ['sint'], true],
      ['r16float', 2, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rg16unorm', 4, f32, vec4f, ['unfilterable-float'], true],
      ['rg16snorm', 4, f32, vec4f, ['unfilterable-float'], true],
      ['rg16uint', 4, u32, vec4u, ['uint'], true],
      ['rg16sint', 4, i32, vec4i, ['sint'], true],
      ['rg16float', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rgba16unorm', 8, f32, vec4f, ['unfilterable-float'], true],
      ['rgba16snorm', 8, f32, vec4f, ['unfilterable-float'], true],
      ['rgba16uint', 8, u32, vec4u, ['uint'], true],
      ['rgba16sint', 8, i32, vec4i, ['sint'], true],
      ['rgba16float', 8, f32, vec4f, ['float', 'unfilterable-float'], true],
    ] as const)(
      '%s has texelSize=%d, channelType=%s, canRenderAttachment=%s',
      (format, texelSize, channelType, vectorType, sampleTypes, canRenderAttachment) => {
        const info = getTextureFormatInfo(format);
        expect(info.texelSize).toBe(texelSize);
        expect(info.channelType).toBe(channelType);
        expect(info.vectorType).toBe(vectorType);
        expect(info.sampleTypes).toEqual(sampleTypes);
        expect(info.canRenderAttachment).toBe(canRenderAttachment);
      },
    );
  });

  describe('32-bit formats', () => {
    it.each([
      ['r32uint', 4, u32, vec4u, ['uint'], true],
      ['r32sint', 4, i32, vec4i, ['sint'], true],
      ['r32float', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rg32uint', 8, u32, vec4u, ['uint'], true],
      ['rg32sint', 8, i32, vec4i, ['sint'], true],
      ['rg32float', 8, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rgba32uint', 16, u32, vec4u, ['uint'], true],
      ['rgba32sint', 16, i32, vec4i, ['sint'], true],
      ['rgba32float', 16, f32, vec4f, ['float', 'unfilterable-float'], true],
    ] as const)(
      '%s has texelSize=%d, channelType=%s, canRenderAttachment=%s',
      (format, texelSize, channelType, vectorType, sampleTypes, canRenderAttachment) => {
        const info = getTextureFormatInfo(format);
        expect(info.texelSize).toBe(texelSize);
        expect(info.channelType).toBe(channelType);
        expect(info.vectorType).toBe(vectorType);
        expect(info.sampleTypes).toEqual(sampleTypes);
        expect(info.canRenderAttachment).toBe(canRenderAttachment);
      },
    );
  });

  describe('packed 32-bit formats', () => {
    it.each([
      ['rgb10a2uint', 4, u32, vec4u, ['uint'], true],
      ['rgb10a2unorm', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rg11b10ufloat', 4, f32, vec4f, ['float', 'unfilterable-float'], true],
      ['rgb9e5ufloat', 4, f32, vec4f, ['float', 'unfilterable-float'], false],
    ] as const)(
      '%s has texelSize=%d, channelType=%s, canRenderAttachment=%s',
      (format, texelSize, channelType, vectorType, sampleTypes, canRenderAttachment) => {
        const info = getTextureFormatInfo(format);
        expect(info.texelSize).toBe(texelSize);
        expect(info.channelType).toBe(channelType);
        expect(info.vectorType).toBe(vectorType);
        expect(info.sampleTypes).toEqual(sampleTypes);
        expect(info.canRenderAttachment).toBe(canRenderAttachment);
      },
    );
  });

  describe('depth/stencil formats', () => {
    it.each([
      ['stencil8', 1, u32, vec4u, ['uint'], true],
      ['depth16unorm', 2, f32, vec4f, ['depth', 'unfilterable-float'], true],
      ['depth24plus', 'non-copyable', f32, vec4f, ['depth', 'unfilterable-float'], true],
      ['depth24plus-stencil8', 'non-copyable', f32, vec4f, ['depth', 'unfilterable-float'], true],
      ['depth32float', 4, f32, vec4f, ['depth', 'unfilterable-float'], true],
      ['depth32float-stencil8', 5, f32, vec4f, ['depth', 'unfilterable-float'], true],
    ] as const)(
      '%s has texelSize=%d, channelType=%s, canRenderAttachment=%s',
      (format, texelSize, channelType, vectorType, sampleTypes, canRenderAttachment) => {
        const info = getTextureFormatInfo(format);
        expect(info.texelSize).toBe(texelSize);
        expect(info.channelType).toBe(channelType);
        expect(info.vectorType).toBe(vectorType);
        expect(info.sampleTypes).toEqual(sampleTypes);
        expect(info.canRenderAttachment).toBe(canRenderAttachment);
      },
    );

    it('depth24plus-stencil8 has both depth and stencil aspect info', () => {
      const info = getTextureFormatInfo('depth24plus-stencil8');
      expect(info.depthAspect).toEqual({
        channelType: f32,
        vectorType: vec4f,
        sampleTypes: ['depth', 'unfilterable-float'],
        texelSize: 'non-copyable',
      });
      expect(info.stencilAspect).toEqual({
        channelType: u32,
        vectorType: vec4u,
        sampleTypes: ['uint'],
        texelSize: 1,
      });
    });

    it('depth32float-stencil8 has both depth and stencil aspect info', () => {
      const info = getTextureFormatInfo('depth32float-stencil8');
      expect(info.depthAspect).toEqual({
        channelType: f32,
        vectorType: vec4f,
        sampleTypes: ['depth', 'unfilterable-float'],
        texelSize: 4,
      });
      expect(info.stencilAspect).toEqual({
        channelType: u32,
        vectorType: vec4u,
        sampleTypes: ['uint'],
        texelSize: 1,
      });
    });

    it('depth16unorm has only depth aspect info', () => {
      const info = getTextureFormatInfo('depth16unorm');
      expect(info.depthAspect).toEqual({
        channelType: f32,
        vectorType: vec4f,
        sampleTypes: ['depth', 'unfilterable-float'],
        texelSize: 2,
      });
      expect(info.stencilAspect).toBeUndefined();
    });

    it('depth24plus has only depth aspect info', () => {
      const info = getTextureFormatInfo('depth24plus');
      expect(info.depthAspect).toEqual({
        channelType: f32,
        vectorType: vec4f,
        sampleTypes: ['depth', 'unfilterable-float'],
        texelSize: 'non-copyable',
      });
      expect(info.stencilAspect).toBeUndefined();
    });

    it('depth32float has only depth aspect info', () => {
      const info = getTextureFormatInfo('depth32float');
      expect(info.depthAspect).toEqual({
        channelType: f32,
        vectorType: vec4f,
        sampleTypes: ['depth', 'unfilterable-float'],
        texelSize: 4,
      });
      expect(info.stencilAspect).toBeUndefined();
    });

    it('stencil8 has only stencil aspect info', () => {
      const info = getTextureFormatInfo('stencil8');
      expect(info.depthAspect).toBeUndefined();
      expect(info.stencilAspect).toEqual({
        channelType: u32,
        vectorType: vec4u,
        sampleTypes: ['uint'],
        texelSize: 1,
      });
    });
  });

  describe('BC compressed formats', () => {
    it.each([
      ['bc1-rgba-unorm', 8],
      ['bc1-rgba-unorm-srgb', 8],
      ['bc4-r-unorm', 8],
      ['bc4-r-snorm', 8],
      ['bc2-rgba-unorm', 16],
      ['bc2-rgba-unorm-srgb', 16],
      ['bc3-rgba-unorm', 16],
      ['bc3-rgba-unorm-srgb', 16],
      ['bc5-rg-unorm', 16],
      ['bc5-rg-snorm', 16],
      ['bc6h-rgb-ufloat', 16],
      ['bc6h-rgb-float', 16],
      ['bc7-rgba-unorm', 16],
      ['bc7-rgba-unorm-srgb', 16],
    ] as const)('%s has texelSize=%d (block size)', (format, texelSize) => {
      const info = getTextureFormatInfo(format);
      expect(info.texelSize).toBe(texelSize);
      expect(info.channelType).toBe(f32);
      expect(info.vectorType).toBe(vec4f);
      expect(info.sampleTypes).toEqual(['float', 'unfilterable-float']);
      expect(info.canRenderAttachment).toBe(false);
    });
  });

  describe('ETC2/EAC compressed formats', () => {
    it.each([
      ['etc2-rgb8unorm', 8],
      ['etc2-rgb8unorm-srgb', 8],
      ['etc2-rgb8a1unorm', 8],
      ['etc2-rgb8a1unorm-srgb', 8],
      ['eac-r11unorm', 8],
      ['eac-r11snorm', 8],
      ['etc2-rgba8unorm', 16],
      ['etc2-rgba8unorm-srgb', 16],
      ['eac-rg11unorm', 16],
      ['eac-rg11snorm', 16],
    ] as const)('%s has texelSize=%d (block size)', (format, texelSize) => {
      const info = getTextureFormatInfo(format);
      expect(info.texelSize).toBe(texelSize);
      expect(info.channelType).toBe(f32);
      expect(info.vectorType).toBe(vec4f);
      expect(info.sampleTypes).toEqual(['float', 'unfilterable-float']);
      expect(info.canRenderAttachment).toBe(false);
    });
  });

  describe('ASTC compressed formats', () => {
    it.each([
      'astc-4x4-unorm',
      'astc-4x4-unorm-srgb',
      'astc-5x4-unorm',
      'astc-5x4-unorm-srgb',
      'astc-5x5-unorm',
      'astc-5x5-unorm-srgb',
      'astc-6x5-unorm',
      'astc-6x5-unorm-srgb',
      'astc-6x6-unorm',
      'astc-6x6-unorm-srgb',
      'astc-8x5-unorm',
      'astc-8x5-unorm-srgb',
      'astc-8x6-unorm',
      'astc-8x6-unorm-srgb',
      'astc-8x8-unorm',
      'astc-8x8-unorm-srgb',
      'astc-10x5-unorm',
      'astc-10x5-unorm-srgb',
      'astc-10x6-unorm',
      'astc-10x6-unorm-srgb',
      'astc-10x8-unorm',
      'astc-10x8-unorm-srgb',
      'astc-10x10-unorm',
      'astc-10x10-unorm-srgb',
      'astc-12x10-unorm',
      'astc-12x10-unorm-srgb',
      'astc-12x12-unorm',
      'astc-12x12-unorm-srgb',
    ] as const)('%s has texelSize=16 (block size)', (format) => {
      const info = getTextureFormatInfo(format);
      expect(info.texelSize).toBe(16);
      expect(info.channelType).toBe(f32);
      expect(info.vectorType).toBe(vec4f);
      expect(info.sampleTypes).toEqual(['float', 'unfilterable-float']);
      expect(info.canRenderAttachment).toBe(false);
    });
  });

  describe('memoization', () => {
    it('returns the same object for the same format', () => {
      const info1 = getTextureFormatInfo('rgba8unorm');
      const info2 = getTextureFormatInfo('rgba8unorm');
      expect(info1).toBe(info2);
    });

    it('returns different objects for different formats', () => {
      const info1 = getTextureFormatInfo('rgba8unorm');
      const info2 = getTextureFormatInfo('rgba16float');
      expect(info1).not.toBe(info2);
    });
  });
});
