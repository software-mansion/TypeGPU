// import tgpu from "typegpu";
// import * as d from "typegpu/data";
// import * as std from "typegpu/std";

//     export const mainFragment = tgpu["~unstable"].fragmentFn({
//       in: { uv: d.vec2f },
//       out: d.vec4f,
//     })(({ uv }) => {
//       {
//         let newuv = std.mul(std.sub(uv.xy, 0.5), 2.0);
//         newuv.y *= h.$ / w.$;
//         let uvv = newuv;
//         let finalColor = d.vec3f(0.0, 0.0, 0.0);
//         for (let i = 0.0; i < 5.0; i++) {
//           newuv = std.sub(
//             std.fract(std.mul(newuv, 1.3 * std.sin(time.$))),
//             0.5
//           );
//           let len = std.length(newuv) * std.exp(-std.length(uvv) * 2);
//           let col = palette(std.length(uvv) + time.$ * 0.9);
//           len = std.sin(len * 8 + time.$) / 8;
//           len = std.abs(len);
//           len = std.smoothstep(0.0, 0.1, len);
//           len = 0.06 / len;
//           finalColor.x += col.x * len;
//           finalColor.y += col.y * len;
//           finalColor.z += col.z * len;
//         }
//         return d.vec4f(finalColor, 1.0);
//       }
//     });

//     //another variation of this shader
//     // export const mainFragment = tgpu["~unstable"].fragmentFn({
//     //   in: { uv: d.vec2f },
//     //   out: d.vec4f,
//     // })(({ uv }) => {
//     //   {
//     //     let newuv: d.vec2f = (uv.xy - 0.5) * 2;
//     //     newuv.y *= h.$ / w.$;
//     //     let uvv = newuv;
//     //     let finalColor = d.vec3f(0.0, 0.0, 0.0);
//     //     for (let i = 0.0; i < 3.0; i++) {
//     //       newuv = std.fract(newuv * -0.9) - 0.5;
//     //       let len = std.length(newuv) * std.exp(-std.length(uvv) * 0.5);
//     //       let col = palette(std.length(uvv) + time.$ * 0.9);
//     //       len = std.sin(len * 8 + time.$) / 8;
//     //       len = std.abs(len);
//     //       len = std.smoothstep(0.0, 0.1, len);
//     //       len = 0.1 / len;
//     //       finalColor.x += col.x * len;
//     //       finalColor.y += col.y * len;
//     //       finalColor.z += col.z * len;
//     //     }
//     //     return d.vec4f(finalColor, 1.0);
//     //   }
//     // });
