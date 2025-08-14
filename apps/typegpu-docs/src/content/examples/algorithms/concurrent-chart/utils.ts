export function concurrentSumOnJS(arr: number[]) {
  arr.reduce((accumulator, currentValue, index) => {
    if (index > 0) {
      arr[index] = arr[index - 1] + currentValue;
    }
    return arr[index];
  }, 0);
  return arr;
}

export function concurrentMultiplyOnJS(arr: number[]) {
  arr.reduce((accumulator, currentValue, index) => {
    if (index > 0) {
      arr[index] = arr[index - 1] * currentValue;
    }
    return arr[index];
  }, 1);
  return arr;
}

export function compareArrayWithBuffer(
  arr1: number[],
  arr2: number[],
): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length - 1; i++) {
    if (arr1[i] !== arr2[i + 1]) {
      console.log(`Mismatch at index ${i}: ${arr1[i]} !== ${arr2[i]}`);
      return false;
    }
  }
  return true;
}
