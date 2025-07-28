import tgpu from "typegpu";
import * as d from "typegpu/data";
import * as std from "typegpu/std";

import { Ray } from "./types";

export const shapeUnion = tgpu.fn(
  [Ray, Ray],
  Ray,
)((a, b) => ({
  color: std.select(a.color, b.color, a.dist > b.dist),
  dist: std.min(a.dist, b.dist),
}));
