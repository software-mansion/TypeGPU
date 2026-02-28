import tgpu, { d, std } from 'typegpu';

const SimpleStruct = d.struct({ vec: d.vec2f });
const SimpleArray = d.arrayOf(d.i32, 2);
const ComplexStruct = d.struct({ arr: SimpleArray });
const ComplexArray = d.arrayOf(SimpleStruct, 3);

// TODO: replace `s = s &&` with `s &&=` when implemented
export const arrayAndStructConstructorsTest = tgpu.fn(
  [],
  d.bool,
)(() => {
  let s = true;

  // default constructors
  const defaultComplexStruct = ComplexStruct();
  s = s && std.arrayLength(defaultComplexStruct.arr) === 2;
  s = s && defaultComplexStruct.arr[0] === 0;
  s = s && defaultComplexStruct.arr[1] === 0;

  const defaultComplexArray = ComplexArray();
  s = s && std.arrayLength(defaultComplexArray) === 3;
  s = s && std.allEq(defaultComplexArray[0].vec, d.vec2f());
  s = s && std.allEq(defaultComplexArray[1].vec, d.vec2f());
  s = s && std.allEq(defaultComplexArray[2].vec, d.vec2f());

  // simple clone constructors
  const simpleStruct = SimpleStruct({ vec: d.vec2f(1, 2) });
  const clonedSimpleStruct = SimpleStruct(simpleStruct);
  s = s && std.allEq(simpleStruct.vec, clonedSimpleStruct.vec);
  simpleStruct.vec[1] += 1;
  s = s && !std.allEq(simpleStruct.vec, clonedSimpleStruct.vec);

  const simpleArray = SimpleArray([3, 4]);
  const clonedSimpleArray = SimpleArray(simpleArray);
  s = s && simpleArray[0] === clonedSimpleArray[0];
  s = s && simpleArray[1] === clonedSimpleArray[1];
  simpleArray[1] += 1;
  s = s && !(simpleArray[1] === clonedSimpleArray[1]);

  // complex clone constructors
  const complexStruct = ComplexStruct({ arr: SimpleArray([5, 6]) });
  const clonedComplexStruct = ComplexStruct(complexStruct);
  s = s && complexStruct.arr[0] === clonedComplexStruct.arr[0];
  s = s && complexStruct.arr[1] === clonedComplexStruct.arr[1];
  complexStruct.arr[1] += 1;
  s = s && !(complexStruct.arr[1] === clonedComplexStruct.arr[1]);

  const complexArray = ComplexArray([
    SimpleStruct({ vec: d.vec2f(7, 8) }),
    SimpleStruct({ vec: d.vec2f(9, 10) }),
    SimpleStruct({ vec: d.vec2f(11, 12) }),
  ]);
  const clonedComplexArray = ComplexArray(complexArray);
  s = s && std.allEq(complexArray[2].vec, clonedComplexArray[2].vec);
  complexArray[2].vec[1] += 1;
  s = s && !std.allEq(complexArray[2].vec, clonedComplexArray[2].vec);

  // indirect clone constructor
  const indirectClonedStruct = SimpleStruct(complexArray[0]);
  s = s && std.allEq(indirectClonedStruct.vec, complexArray[0].vec);

  const indirectlyClonedArray = SimpleArray(complexStruct.arr);
  s = s && indirectlyClonedArray[0] === complexStruct.arr[0];
  s = s && indirectlyClonedArray[1] === complexStruct.arr[1];

  return s;
});
