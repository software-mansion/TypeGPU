// import tgpu from "typegpu";
// import * as d from "typegpu/data";
// import * as std from "typegpu/std";
// import { SUN_DIRECTION, ANGLE_DISTORTION, SUN_INTENSITY } from "../consts";
//     const mainFragment = tgpu["~unstable"].fragmentFn({
//       in: { uv: d.vec2f },
//       out: d.vec4f,
//     })(({ uv }) => {
//       {
//         let new_uv = std.mul(std.sub(uv, 0.5), 2.0);
//         new_uv = d.vec2f(new_uv.x, new_uv.y * (h.$ / w.$));
//         const sunDirection = std.normalize(SUN_DIRECTION);
//         const ro = d.vec3f(0.0, 0.0, -3.0);
//         const rd = std.normalize(d.vec3f(new_uv.x, new_uv.y, ANGLE_DISTORTION));
//         const sun = std.clamp(std.dot(rd, sunDirection), 0.0, 1.0);

//         let color = d.vec3f(0.75, 0.66, 0.9);

//         color = std.sub(color, std.mul(0.35 * rd.y, d.vec3f(1, 0.7, 0.43)));

//         color = std.add(
//           color,
//           std.mul(
//             d.vec3f(1.0, 0.37, 0.17),
//             std.pow(sun, 1.0 / std.pow(SUN_INTENSITY, 3.0))
//           )
//         );

//         const res = raymarch(ro, rd, sunDirection);

//         color = std.add(std.mul(color, 1.1 - res.w), res.xyz);

//         return d.vec4f(color, 1.0);
//       }
//     });
