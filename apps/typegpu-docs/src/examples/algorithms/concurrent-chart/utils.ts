export function concurrentSumOnJS(arr: number[]) {
  for (let i = 1; i < arr.length; i++) {
    arr[i] += arr[i - 1];
  }
  // In Blelloch scan, the result starts with identity element
  arr.unshift(0);
  arr.pop();
  return arr;
}

export function compareArrayWithBuffer(
  arr1: number[],
  arr2: number[],
): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      console.log(`Mismatch at index ${i}: ${arr1[i]} !== ${arr2[i]}`);
      return false;
    }
  }
  return true;
}
