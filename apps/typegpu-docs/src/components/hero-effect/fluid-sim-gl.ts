import { d, std, type TgpuRoot } from 'typegpu';
import { fullScreenTriangle } from './fullscreen.ts';
import { DROPLET_COUNT } from './droplets.ts';
import { SIM_N } from './fluid-sim.ts';

/** Persistent, advected ink without compute shaders or float render-target extensions. */
export function createFluidSimGL(root: TgpuRoot, canvas: HTMLCanvasElement) {
  const textures = [0, 1].map(() =>
    root
      .createTexture({
        size: [SIM_N, SIM_N],
        format: 'rgba8unorm',
      })
      .$usage('render', 'sampled'),
  );
  const views = textures.map((texture) => texture.createView());
  const targets = textures.map((texture) => texture.createView('render'));
  const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const state = root.createUniform(d.vec4f); // dt, time, pointer movement, current texture
  const pointer = root.createUniform(d.vec2f, [-100, -100]);
  const drops = Array.from({ length: DROPLET_COUNT }, (_, i) => {
    const travel = (1.05 * (i + 0.5)) / DROPLET_COUNT;
    return {
      x: SIM_N * (0.4 + ((i * 0.618034) % 1) * 0.65 - travel * 0.45),
      y: SIM_N * (1.02 - travel),
      speed: 45 + ((i * 0.754877) % 1) * 45,
      phase: i * 2.4,
    };
  });
  const tips = root.createUniform(d.arrayOf(d.vec4f, DROPLET_COUNT));
  const pipelines = views.map((source, i) =>
    root
      .createRenderPipeline({
        vertex: fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          const pos = d.vec2f(uv.x, 1 - uv.y) * SIM_N;
          // Drift and curl carry the trails down-left, as in the compute simulation.
          const flow = d.vec2f(-4 + std.sin(pos.y * 0.035 + state.$.y) * 3, -9);
          const previousUv = uv - (flow * d.vec2f(1, -1) * state.$.x) / SIM_N;
          let ink = std.textureSample(source.$, sampler.$, previousUv).x;
          ink = std.max(0, ink * std.pow(0.99, state.$.x * 60) - 0.5 / 255);
          for (let j = d.u32(0); j < DROPLET_COUNT; j++) {
            const tip = tips.$[j];
            const movement = tip.xy - tip.zw;
            const along = std.clamp(
              std.dot(pos - tip.zw, movement) / std.max(std.dot(movement, movement), 0.000001),
              0,
              1,
            );
            const offset = pos - (tip.zw + movement * along);
            const radius = 6 + d.f32(j % 3) * 1.5;
            ink +=
              std.exp(-std.dot(offset, offset) / (radius * radius)) *
              0.048 *
              std.min(std.length(movement), 2);
          }
          const offset = pos - pointer.$;
          ink += std.exp(-std.dot(offset, offset) / (SIM_N / 16) ** 2) * 0.08 * state.$.z;
          return d.vec4f(ink, 0, 0, 1);
        },
        targets: { format: 'rgba8unorm' },
      })
      .withColorAttachment({ view: targets[1 - i] }),
  );

  let current = 0;
  let previousTime: number | undefined;
  let previousPointer: [number, number] | undefined;
  let movement = 0;
  const resetPointer = () => {
    previousPointer = undefined;
    movement = 0;
  };
  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * SIM_N;
    const y = (1 - (event.clientY - rect.top) / rect.height) * SIM_N;
    if (!Number.isFinite(x + y) || x < 0 || x >= SIM_N || y < 0 || y >= SIM_N) {
      resetPointer();
      return;
    }
    if (previousPointer) movement += Math.hypot(x - previousPointer[0], y - previousPointer[1]);
    previousPointer = [x, y];
    pointer.write(previousPointer);
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('blur', resetPointer);
  window.addEventListener('pointercancel', resetPointer);
  window.addEventListener('pointerup', resetPointer);
  document.addEventListener('pointerleave', resetPointer);

  return {
    sample: (uv: d.v2f) => {
      'use gpu';
      if (state.$.w < 0.5)
        return std.textureSample(views[0].$, sampler.$, d.vec2f(uv.x, 1 - uv.y)).x / 4;
      return std.textureSample(views[1].$, sampler.$, d.vec2f(uv.x, 1 - uv.y)).x / 4;
    },
    update(timestamp: number) {
      const dt =
        previousTime === undefined ? 1 / 60 : Math.min((timestamp - previousTime) / 1000, 1 / 30);
      previousTime = timestamp;
      tips.write(
        drops.map((drop, i) => {
          let px = drop.x;
          let py = drop.y;
          drop.phase += dt;
          const phase = drop.phase;
          const scale =
            0.9 +
            0.18 * Math.sin(phase * (0.8 + drop.speed * 0.005)) +
            0.07 * Math.sin(phase * 2.3);
          drop.x +=
            (-drop.speed * (0.45 + Math.sin(phase * 1.3) * 0.1) + Math.sin(phase * 3.7) * 3) *
            scale *
            dt;
          drop.y -= drop.speed * scale * dt;
          if (drop.x < -12 || drop.y < -12) {
            const seed = (i * 0.618034 + phase * 0.071) % 1;
            const height = (i * 0.754877 + phase * 0.113) % 1;
            drop.x = SIM_N * (seed < 0.35 ? 1.02 : 0.4 + seed * 0.65);
            drop.y = SIM_N * (seed < 0.35 ? 0.3 + height * 0.7 : 1.02 + height * 0.12);
            drop.speed = 45 + ((phase * 0.137 + i * 0.56984) % 1) * 45;
            px = drop.x;
            py = drop.y;
          }
          return [drop.x, drop.y, px, py];
        }),
      );
      state.write([dt, timestamp / 1000, Math.min(movement, 1), current]);
      pipelines[current].draw(3);
      current = 1 - current;
      state.write([dt, timestamp / 1000, 0, current]);
      movement = 0;
    },
    destroy() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', resetPointer);
      window.removeEventListener('pointercancel', resetPointer);
      window.removeEventListener('pointerup', resetPointer);
      document.removeEventListener('pointerleave', resetPointer);
      for (const texture of textures) texture.destroy();
      for (const uniform of [state, pointer, tips]) uniform.buffer.destroy();
    },
  };
}
