import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const SimpleStruct = d.struct({ vec: d.vec2f });

const modifyNum = tgpu.fn([d.ptrFn(d.u32)])((ptr) => {
  ptr += 1;
});

const modifyVec = tgpu.fn([d.ptrFn(d.vec2f)])((ptr) => {
  ptr.x += 1;
});

const modifyStruct = tgpu.fn([d.ptrFn(SimpleStruct)])((ptr) => {
  ptr.vec.x += 1;
});

// TODO: replace `s = s &&` with `s &&=` when implemented
export const pointersTest = tgpu.fn([], d.bool)(() => {
  let s = true;

  let num = d.u32(0);
  modifyNum(num);
  s = s && (num === 1);

  const vec = d.vec2f(1, 2);
  modifyVec(vec);
  s = s && std.allEq(vec, d.vec2f(2, 2));

  const myStruct = SimpleStruct({ vec: d.vec2f(3, 4) });
  modifyStruct(myStruct);
  s = s && std.allEq(myStruct.vec, d.vec2f(4, 4));

  return s;
});
