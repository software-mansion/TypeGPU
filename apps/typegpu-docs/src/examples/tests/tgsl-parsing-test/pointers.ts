import tgpu, { d, std } from 'typegpu';

const SimpleStruct = d.struct({ vec: d.vec2f });

const modifyNumFn = tgpu.fn([d.ptrFn(d.u32)])((ptr) => {
  ptr.$ += 1;
});

const modifyVecFn = tgpu.fn([d.ptrFn(d.vec2f)])((ptr) => {
  ptr.$.x += 1;
});

const modifyStructFn = tgpu.fn([d.ptrFn(SimpleStruct)])((ptr) => {
  ptr.$.vec.x += 1;
});

const privateVec = tgpu.privateVar(d.vec2f);
const modifyVecPrivate = tgpu.fn([d.ptrPrivate(d.vec2f)])((ptr) => {
  ptr.$.x += 1;
});

const privateStruct = tgpu.privateVar(SimpleStruct);
const modifyStructPrivate = tgpu.fn([d.ptrPrivate(SimpleStruct)])((ptr) => {
  ptr.$.vec.x += 1;
});

// TODO: replace `s = s &&` with `s &&=` when implemented
export const pointersTest = tgpu.fn(
  [],
  d.bool,
)(() => {
  let s = true;

  // function pointers
  const num = d.ref(d.u32());
  modifyNumFn(num);
  s = s && num.$ === 1;

  const vec = d.ref(d.vec2f());
  modifyVecFn(vec);
  s = s && std.allEq(vec.$, d.vec2f(1, 0));

  const myStruct = d.ref(SimpleStruct());
  modifyStructFn(myStruct);
  s = s && std.allEq(myStruct.$.vec, d.vec2f(1, 0));

  // private pointers
  modifyVecPrivate(d.ref(privateVec.$));
  s = s && std.allEq(privateVec.$, d.vec2f(1, 0));

  modifyStructPrivate(d.ref(privateStruct.$));
  s = s && std.allEq(privateStruct.$.vec, d.vec2f(1, 0));

  return s;
});
