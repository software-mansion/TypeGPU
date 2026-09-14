import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { common, d } from 'typegpu';
import {
  prepareStrokes,
  changeOpacity,
  cameraChange,
  depthStrokeScale,
  strokeComesBefore,
  revealAt,
  incrementalAlpha,
  copyFrameFragment,
  downsampleFragment,
  paintFragment,
} from '../../src/examples/image-processing/monocular-painting/shaders.ts';

describe('monocular painting shaders', () => {
  it('weights luma above chroma while preserving neutral-change sensitivity', () => {
    const gray = d.vec3f(0.5);
    const brightness = cameraChange(d.vec3f(0.6), gray);
    // A 0.1 Cb shift with unchanged Rec.709 luma.
    const chroma = cameraChange(gray.add(d.vec3f(0, -0.018556 * 0.722 / 0.7152, 0.18556)), gray);
    expect(cameraChange(gray, gray)).toBe(0);
    expect(brightness).toBeCloseTo(Math.sqrt(3) * 0.1);
    expect(chroma).toBeCloseTo(brightness * 0.25);
    expect(cameraChange(gray, d.vec3f(0.6))).toBeCloseTo(brightness);
  });
  it('raises repaint opacity smoothly for stronger camera changes', () => {
    expect(changeOpacity(0.035, 0.45)).toBeCloseTo(0.45);
    expect(changeOpacity(0.1175, 0.45)).toBeCloseTo(0.725);
    expect(changeOpacity(0.2, 0.45)).toBe(1);
    expect(changeOpacity(1, 0.45)).toBe(1);
    expect(changeOpacity(0.2, 0)).toBe(0);
  });
  it('orders nearer strokes first across grids and enlarges distant strokes', () => {
    expect(strokeComesBefore(0.9, 0, 0.2, 32768)).toBe(true);
    expect(strokeComesBefore(0.2, 32768, 0.9, 0)).toBe(false);
    expect(strokeComesBefore(0.5, 32768, 0.5, 0)).toBe(true);
    expect(depthStrokeScale(1)).toBeCloseTo(2.4);
    expect(depthStrokeScale(0.75)).toBeCloseTo(1.35);
    expect(depthStrokeScale(0.5)).toBe(1);
    expect(depthStrokeScale(0.25)).toBeCloseTo(3.1);
    expect(depthStrokeScale(0)).toBe(3.4);
    expect(depthStrokeScale(0.25)).toBeGreaterThan(depthStrokeScale(0.75));
  });
  it('reveals in stroke direction without multiplying opacity across frames', () => {
    expect(revealAt(-0.5, 0.2)).toBeGreaterThan(revealAt(0.5, 0.2));
    expect(revealAt(0.5, 0.5)).toBe(1);
    for (const position of [-1, -0.5, 0, 0.5, 1]) {
      expect(revealAt(position, -0.1)).toBe(0);
      expect(revealAt(position, 0)).toBe(0);
      expect(revealAt(position, 1)).toBe(1);
      for (const steps of [8, 24, 60]) {
        let color = 1;
        for (let step = 1; step <= steps; step++) {
          const alpha = incrementalAlpha(
            0.45,
            revealAt(position, (step - 1) / steps),
            revealAt(position, step / steps),
          );
          color = color * (1 - alpha) + 0.3 * alpha;
        }
        expect(color).toBeCloseTo(1 * 0.55 + 0.3 * 0.45, 5);
      }
    }
  });
  it('resolves frame-copy and bilinear mip pipelines', async ({ root, device }) => {
    for (const fragment of [copyFrameFragment, downsampleFragment]) {
      await root
        .createRenderPipeline({
          vertex: common.fullScreenTriangle,
          fragment,
          targets: { format: 'rgba8unorm' },
        })
        .initAsync();
    }
    expect(device.mock.createShaderModule).toHaveBeenCalledTimes(2);
  });
  it('resolves stroke preparation and painting pipelines', async ({ root, device }) => {
    await root
      .createComputePipeline({ compute: prepareStrokes })
      .$name('prepare strokes')
      .initAsync();
    await root
      .createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: paintFragment,
        targets: { format: 'rgba8unorm' },
      })
      .$name('paint strokes')
      .initAsync();
    expect(device.mock.createShaderModule).toHaveBeenCalledTimes(2);
    expect(device.mock.createShaderModule).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.stringContaining('texture_external') }),
    );
  });
});
