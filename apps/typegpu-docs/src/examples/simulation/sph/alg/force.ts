import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Particle, SPHParams } from './copyPosition';
import { Environment } from './density';

export const makeComputeForce = (
    particles: any,
    sortedParticles: any,
    prefixSum: any,
    env: any,
    params: any,
) =>
    tgpu['~unstable'].computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [64] })(({ gid }) => {
        if (gid.x >= params.$.n) return;

        const pi = particles.$[gid.x];
        const pos_i = pi.position;
        const vi = pi.v;
        const density_i = pi.density;
        const nearDensity_i = pi.nearDensity;

        let fPress = d.vec3f();
        let fVisc = d.vec3f();

        const cellNumberFromId = (xi: any, yi: any, zi: any) => xi + yi * env.$.xGrids + zi * env.$.xGrids * env.$.yGrids;
        const cellPosition = (v: any) => {
            const xi = d.i32(std.floor((v.x + env.$.xHalf + env.$.offset) / env.$.cellSize));
            const yi = d.i32(std.floor((v.y + env.$.yHalf + env.$.offset) / env.$.cellSize));
            const zi = d.i32(std.floor((v.z + env.$.zHalf + env.$.offset) / env.$.cellSize));
            return d.vec3i(xi, yi, zi);
        };

        const v = cellPosition(pos_i);
        const insideGrid = v.x < env.$.xGrids && 0 <= v.x && v.y < env.$.yGrids && 0 <= v.y && v.z < env.$.zGrids && 0 <= v.z;
        if (insideGrid) {
            const zMin = std.max(-1, -v.z);
            const zMax = std.min(1, env.$.zGrids - v.z - 1);
            for (let dz = zMin; dz <= zMax; dz++) {
                const yMin = std.max(-1, -v.y);
                const yMax = std.min(1, env.$.yGrids - v.y - 1);
                for (let dy = yMin; dy <= yMax; dy++) {
                    const dxMin = std.max(-1, -v.x);
                    const dxMax = std.min(1, env.$.xGrids - v.x - 1);
                    const startCellNum = cellNumberFromId(v.x + dxMin, v.y + dy, v.z + dz);
                    const endCellNum = cellNumberFromId(v.x + dxMax, v.y + dy, v.z + dz);
                    const start = prefixSum.$[startCellNum];
                    const end = prefixSum.$[endCellNum + 1];
                    for (let j = start; j < end; j++) {
                        const pj = sortedParticles.$[j];
                        const density_j = pj.density;
                        const nearDensity_j = pj.nearDensity;
                        const pos_j = pj.position;
                        const rVec = pos_j.sub(pos_i);
                        const r2 = std.dot(rVec, rVec);
                        if (density_j === 0 || nearDensity_j === 0) continue;
                        if (r2 < params.$.kernelRadiusPow2 && r2 > 1e-8) {
                            const r = std.sqrt(r2);

                            // pressures
                            const pressure_i = params.$.stiffness * (density_i - params.$.restDensity);
                            const pressure_j = params.$.stiffness * (density_j - params.$.restDensity);
                            const nearPressure_i = params.$.nearStiffness * nearDensity_i;
                            const nearPressure_j = params.$.nearStiffness * nearDensity_j;

                            const dir = std.normalize(rVec);

                            // Gradient kernels
                            const dRem = params.$.kernelRadius - r;
                            const gradScale = 45.0 / (Math.PI * params.$.kernelRadiusPow6);
                            const grad = std.max(0, gradScale * dRem * dRem);
                            const nearGradScale = 45.0 / (Math.PI * params.$.kernelRadiusPow5);
                            const nearGrad = std.max(0, nearGradScale * dRem * dRem);

                            // Symmetric pressure
                            const rho_i = std.max(density_i, 1e-6);
                            const rho_j = std.max(density_j, 1e-6);
                            const pressTerm = params.$.mass * (pressure_i / (rho_i * rho_i) + pressure_j / (rho_j * rho_j));
                            fPress = fPress.add(dir.mul(-pressTerm * grad));

                            // Near-pressure stabilizer (no division by near density)
                            const nearShared = 0.5 * (nearPressure_i + nearPressure_j);
                            fPress = fPress.add(dir.mul(-params.$.mass * nearShared * nearGrad));

                            // Viscosity
                            const relV = pj.v.sub(vi);
                            const viscLapScale = 45.0 / (Math.PI * params.$.kernelRadiusPow6);
                            const viscLap = std.max(0, viscLapScale * dRem);
                            fVisc = fVisc.add(relV.mul(params.$.mass * viscLap / rho_j));
                        }
                    }
                }
            }
        }

        fVisc = fVisc.mul(params.$.viscosity);
        const fGrv = d.vec3f(0, -9.8, 0).mul(density_i);
        const totalF = fPress.add(fVisc).add(fGrv);

        particles.$[gid.x] = Particle({ position: pi.position, v: vi, force: totalF, density: density_i, nearDensity: nearDensity_i });
    });