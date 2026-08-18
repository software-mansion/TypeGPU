import { describe, expect, it } from 'vitest';
import { tgpu } from 'typegpu';
import {
  depthPrepareKernel,
  relightFragment,
  stabilizeRangeKernel,
  surfaceKernel,
} from '../../src/examples/image-processing/monocular-light-injection/shaders.ts';

describe('depth relighting shaders', () => {
  it('carries the percentile range across frames so normalization cannot pulse', () => {
    const wgsl = tgpu.resolve([stabilizeRangeKernel]);
    expect(wgsl).toContain('var<storage, read> frameRange');
    expect(wgsl).toContain('var<storage, read_write> stableRange');
    expect(wgsl).toContain('mix(');
  });

  it('blends depth history faster where the pixel moved, so edges do not trail a ghost', () => {
    const wgsl = tgpu.resolve([depthPrepareKernel]);
    expect(wgsl).toContain('smoothstep(0.02f, 0.09f');
    expect(wgsl).toContain('var<storage, read_write> history');
  });

  it('passes depth through unshaped, since no depth-only test separates a soft silhouette from a steep surface', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    expect(wgsl).not.toContain('sharpenedDepth');
  });

  it('reads full-precision depth history so the gradient is not terraced by fp16', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    expect(wgsl).toContain('var<storage, read> depth: array<f32>');
    expect(wgsl).not.toContain('textureLoad(');
    expect(wgsl).toContain('textureStore(');
  });

  it('subtracts the noise floor in energy, so form just above it is not scaled down', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    expect(wgsl).toContain('sqrt(max(((steepness * steepness) -');
    expect(wgsl).toContain('tanh((shrunk /');
  });

  it('differences the depth across a wide baseline, since a narrow one amplifies the band the model is worst at', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    expect(wgsl).toContain('depthTexelAt((coord + vec2i(-7, 0)), size)');
    expect(wgsl).toContain('depthTexelAt((coord + vec2i(0, 7)), size)');
  });

  it('floors the occlusion taps, since the sweep reads the depth field with none of the shaping the normal gets', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    expect(wgsl).toContain('max((difference - 0.012f), 0f)');
  });

  it('saturates toward the ceiling rather than clipping, since a hard limit draws its own contour where form crosses it', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    const shaping = wgsl.slice(wgsl.indexOf('fn surfaceSlope'));
    expect(wgsl).toContain('let ceiling = (9e-3f * tanh((shrunk / 9e-3f)))');
    expect(shaping.slice(0, shaping.indexOf('\n}'))).not.toContain('smoothstep');
    expect(wgsl).not.toContain('clamp(delta,');
  });

  it('weights the two one-sided differences instead of choosing one, so a ridge crest is not a seam', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    expect(wgsl).toContain('(((backward * front) + (forward * back)) / max((back + front)');
    const picking = wgsl.slice(wgsl.indexOf('fn gentlerDelta'));
    expect(picking.slice(0, picking.indexOf('\n}'))).not.toContain('if ');
  });

  it('shapes the gradient by magnitude, so a diagonal slope is not treated as two axes', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    expect(wgsl).toContain('let steepness = max(length(gradient)');
    expect(wgsl).toContain('return (gradient * (ceiling / steepness))');
  });

  it('range checks occlusion taps so a distant occluder cannot outline the subject', () => {
    const wgsl = tgpu.resolve([surfaceKernel]);
    expect(wgsl).toContain('saturate((abs(difference) / 0.25f))');
  });

  it('takes color from the camera texture, not from the normalized model input', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('texture_external');
    expect(wgsl).toContain('textureSampleBaseClampToEdge(');
    expect(wgsl).not.toContain('0.485');
  });

  it('traces the light against the depth field and tone maps the result', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('textureSampleLevel(');
    expect(wgsl).toContain('normalize(');
    expect(wgsl).toContain('pow(');
  });

  it('biases the shadow march by the receiver tangent plane, not by a constant slope', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('receiverRise');
    expect(wgsl).toContain('risePerTravel');
  });

  it('budgets the march across the screen so a shadow reaches its own terminator', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('max(length(shadowToLight.xy),');
  });

  it('marches in a deeper space than the falloff, so a raised hand outruns the ray', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('shadowZ');
    expect(wgsl).toContain('-1.25f');
    expect(wgsl).toContain('-0.699999988079071f');
  });

  it('composites the bulb over the scene, since an added disc is a film the image shows through', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('fn bulbSurface');
    expect(wgsl).toContain('let coverage = ((1f - smoothstep((1f - edge), (1f + edge), spread))');
    expect(wgsl).toContain('lit = mix(lit,');
  });

  it('takes the silhouette softness from the screen derivative, before the distance is clamped', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('let edge = clamp((fwidth(spread)');
    expect(wgsl).toContain('let limb = saturate(spread)');
  });

  it('holds the bulb once the light is on, so raising intensity cannot bloom over the subject', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('fn bulbGlow');
    expect(wgsl).toContain('saturate((params.intensity / 0.6f))');
  });

  it('compresses luminance before channels, so a tinted light keeps its hue where it is brightest', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('let luminance = max(dot(color, vec3f(0.2125');
    expect(wgsl).toContain('mix((color * (mapped / luminance)), perChannel, bleach)');
  });

  it('dithers the quantization, so the bloom does not band into rings across a dark wall', () => {
    const wgsl = tgpu.resolve([relightFragment]);
    expect(wgsl).toContain('- 0.5f) * 0.00392156862745098f');
  });
});
