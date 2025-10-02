import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Particle, SPHParams } from './copyPosition';

export const Environment = d.struct({
    xGrids: d.i32,
    yGrids: d.i32,
    zGrids: d.i32,
    cellSize: d.f32,
    xHalf: d.f32,
    yHalf: d.f32,
    zHalf: d.f32,
    offset: d.f32,
});


export const makeComputeDensity = (
    particles: any,
    sortedParticles: any,
    prefixSum: any,
    env: any,
    params: any,
) =>
    tgpu['~unstable'].computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [64] })(({ gid }) => {
        if (gid.x >= params.$.n) return;

        // Helpers
        const cellNumberFromId = (xi: any, yi: any, zi: any) => xi + yi * env.$.xGrids + zi * env.$.xGrids * env.$.yGrids;
        const cellPosition = (v: any) => {
            const xi = d.i32(std.floor((v.x + env.$.xHalf + env.$.offset) / env.$.cellSize));
            const yi = d.i32(std.floor((v.y + env.$.yHalf + env.$.offset) / env.$.cellSize));
            const zi = d.i32(std.floor((v.z + env.$.zHalf + env.$.offset) / env.$.cellSize));
            return d.vec3i(xi, yi, zi);
        };

        const pos_i = particles.$[gid.x].position;
        const v = cellPosition(pos_i);

        let dens = d.f32(0);
        let nearDens = d.f32(0);

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
                        const pos_j = sortedParticles.$[j].position;
                        const rVec = pos_i.sub(pos_j);
                        const r2 = std.dot(rVec, rVec);
                        if (r2 < params.$.kernelRadiusPow2) {
                            const r = std.sqrt(r2);
                            // poly6 and near-density kernels inline
                            const scaleD = 315.0 / (64.0 * Math.PI * params.$.kernelRadiusPow9);
                            const dd = params.$.kernelRadiusPow2 - r * r;
                            const kD = std.max(0, scaleD * dd * dd * dd);
                            const scaleN = 15.0 / (Math.PI * params.$.kernelRadiusPow6);
                            const dRem = params.$.kernelRadius - r;
                            const kN = std.max(0, scaleN * dRem * dRem * dRem);
                            dens += params.$.mass * kD;
                            nearDens += params.$.mass * kN;
                        }
                    }
                }
            }
        }

        const pOld = particles.$[gid.x];
        particles.$[gid.x] = Particle({ position: pOld.position, v: pOld.v, force: pOld.force, density: dens, nearDensity: nearDens });
    });
