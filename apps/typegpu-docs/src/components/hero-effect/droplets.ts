import { d, std, type TgpuRoot } from 'typegpu';

export const DROPLET_COUNT = 16;
export const Droplet = d.struct({
  pos: d.vec2f,
  previous: d.vec2f,
  speed: d.f32,
  phase: d.f32,
});
export const Droplets = d.arrayOf(Droplet, DROPLET_COUNT);

/** Moving brush tips in fluid-grid coordinates (positive Y points up). */
export function createDroplets(root: TgpuRoot, gridSize: number) {
  const droplets = root.createMutable(
    Droplets,
    Array.from({ length: DROPLET_COUNT }, (_, i) => {
      // Stratify progress over the entire diagonal journey, not just the spawn area.
      const startX = 0.4 + ((i * 0.618034) % 1) * 0.65;
      const startY = 1.02;
      const progress = (i + 0.5) / DROPLET_COUNT;
      const travel = Math.min(startY + 0.03, (startX + 0.03) / 0.45) * progress;
      const pos = d.vec2f(gridSize * (startX - travel * 0.45), gridSize * (startY - travel));
      return {
        pos,
        previous: pos,
        speed: 45 + ((i * 0.754877) % 1) * 45,
        phase: i * 2.4,
      };
    }),
  );
  const deltaTime = root.createUniform(d.f32, 0);
  const pipeline = root.createGuardedComputePipeline((index: number) => {
    'use gpu';
    const drop = droplets.$[index];
    const dt = deltaTime.$;
    const phase = drop.phase + dt;
    // Continuous motion with gentle, overlapping speed variations (65–115%).
    const speedScale =
      0.9 + 0.18 * std.sin(phase * (0.8 + drop.speed * 0.005)) + 0.07 * std.sin(phase * 2.3);
    // A steady sideways pull makes the trails slant down-left, with small gusts.
    const sideways = -drop.speed * (0.45 + std.sin(phase * 1.3) * 0.1);
    const velocity = d.vec2f(sideways + std.sin(phase * 3.7) * 3, -drop.speed) * speedScale;
    let pos = drop.pos + velocity * dt;
    let previous = d.vec2f(drop.pos);
    let speed = drop.speed;
    if (pos.y < -12 || pos.x < -12) {
      const seed = std.fract(d.f32(index) * 0.618034 + phase * 0.071);
      const height = std.fract(d.f32(index) * 0.754877 + phase * 0.113);
      pos = d.vec2f(gridSize * (0.4 + seed * 0.65), gridSize * (1.02 + height * 0.12));
      // Some drops enter from the right, breaking up the long trip from the top.
      if (seed < 0.35) {
        pos = d.vec2f(gridSize * 1.02, gridSize * (0.3 + height * 0.7));
      }
      speed = 45 + std.fract(phase * 0.137 + d.f32(index) * 0.56984) * 45;
      // Respawning must not paint a line from the bottom back to the top.
      previous = d.vec2f(pos);
    }
    droplets.$[index] = Droplet({ pos, previous, speed, phase });
  });

  return {
    buffer: droplets.buffer,
    update(dt: number) {
      deltaTime.write(dt);
      pipeline.dispatchThreads(DROPLET_COUNT);
    },
    destroy() {
      droplets.buffer.destroy();
      deltaTime.buffer.destroy();
    },
  };
}
