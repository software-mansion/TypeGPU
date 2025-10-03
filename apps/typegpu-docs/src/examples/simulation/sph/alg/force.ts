import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Particle, SPHParams } from './copyPosition';
import { Environment } from './density';

export const forceLayout = tgpu.bindGroupLayout({
    particles: { storage: d.arrayOf(Particle), access: 'mutable' },
    prefixSum: { storage: d.arrayOf(d.u32), access: 'readonly' },
    env: { uniform: Environment },
    params: { uniform: SPHParams },
});

const { particles, prefixSum, env, params } = forceLayout.bound;

const cellNumberFromId = tgpu.fn([d.i32, d.i32, d.i32], d.i32)((xi, yi, zi) =>
    xi + yi * env.value.xGrids + zi * env.value.xGrids * env.value.yGrids
);
const cellPosition = tgpu.fn([d.vec3f], d.vec3i)((v: any) => {
    const xi = d.i32(std.floor((v.x + env.value.xHalf + env.value.offset) / env.value.cellSize));
    const yi = d.i32(std.floor((v.y + env.value.yHalf + env.value.offset) / env.value.cellSize));
    const zi = d.i32(std.floor((v.z + env.value.zHalf + env.value.offset) / env.value.cellSize));
    return d.vec3i(xi, yi, zi);
});

export const computeForce = tgpu['~unstable'].computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [64] })(({ gid }) => {
    if (gid.x >= params.value.n) return;

    const pi = particles.value[gid.x];
    const pos_i = pi.position;
    const vi = pi.v;
    const density_i = pi.density;
    const nearDensity_i = pi.nearDensity;

    let fPress = d.vec3f();
    let fVisc = d.vec3f();

    const v = cellPosition(pos_i);
    const insideGrid = v.x < env.value.xGrids && 0 <= v.x && v.y < env.value.yGrids && 0 <= v.y && v.z < env.value.zGrids && 0 <= v.z;
    if (insideGrid) {
        const zMin = std.max(-1, -v.z);
        const zMax = std.min(1, env.value.zGrids - v.z - 1);
        for (let dz = zMin; dz <= zMax; dz++) {
            const yMin = std.max(-1, -v.y);
            const yMax = std.min(1, env.value.yGrids - v.y - 1);
            for (let dy = yMin; dy <= yMax; dy++) {
                const dxMin = std.max(-1, -v.x);
                const dxMax = std.min(1, env.value.xGrids - v.x - 1);
                const startCellNum = cellNumberFromId(v.x + dxMin, v.y + dy, v.z + dz);
                const endCellNum = cellNumberFromId(v.x + dxMax, v.y + dy, v.z + dz);
                const start = prefixSum.value[startCellNum];
                const end = prefixSum.value[endCellNum + 1];
                for (let j = start; j < end; j++) {
                    const pj = particles.value[j];
                    const density_j = pj.density;
                    const nearDensity_j = pj.nearDensity;
                    if (density_j === 0 || nearDensity_j === 0) continue;

                    const pos_j = pj.position;
                    const rVec = pos_j.sub(pos_i);
                    const r2 = std.dot(rVec, rVec);
                    if (r2 < params.value.kernelRadiusPow2 && r2 > 1e-8) {
                        const r = std.sqrt(r2);

                        const pressure_i = params.value.stiffness * (density_i - params.value.restDensity);
                        const pressure_j = params.value.stiffness * (density_j - params.value.restDensity);
                        const nearPressure_i = params.value.nearStiffness * nearDensity_i;
                        const nearPressure_j = params.value.nearStiffness * nearDensity_j;

                        const dir = std.normalize(rVec);

                        const dRem = params.value.kernelRadius - r;
                        const gradScale = 45.0 / (Math.PI * params.value.kernelRadiusPow6);
                        const grad = std.max(0, gradScale * dRem * dRem);
                        const nearGradScale = 45.0 / (Math.PI * params.value.kernelRadiusPow5);
                        const nearGrad = std.max(0, nearGradScale * dRem * dRem);

                        const rho_i = std.max(density_i, 1e-6);
                        const rho_j = std.max(density_j, 1e-6);
                        const pressTerm = params.value.mass * (pressure_i / (rho_i * rho_i) + pressure_j / (rho_j * rho_j));
                        fPress = fPress.add(dir.mul(-pressTerm * grad));

                        const nearShared = 0.5 * (nearPressure_i + nearPressure_j);
                        fPress = fPress.add(dir.mul(-params.value.mass * nearShared * nearGrad));

                        const relV = pj.v.sub(vi);
                        const viscLapScale = 45.0 / (Math.PI * params.value.kernelRadiusPow6);
                        const viscLap = std.max(0, viscLapScale * dRem);
                        fVisc = fVisc.add(relV.mul(params.value.mass * viscLap / rho_j));
                    }
                }
            }
        }
    }

    fVisc = fVisc.mul(params.value.viscosity);
    const fGrv = d.vec3f(0, -9.8, 0).mul(density_i);
    const totalF = fPress.add(fVisc).add(fGrv);

    particles.value[gid.x] = Particle({ position: pi.position, v: vi, force: totalF, density: density_i, nearDensity: nearDensity_i });
});