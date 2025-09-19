export function concurrentSumOnJS(arr: number[]) {
  for (let i = 1; i < arr.length; i++) {
    arr[i] += arr[i - 1];
  }
  return arr;
}

export function compareArrayWithBuffer(
  arr1: number[],
  arr2: number[],
): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  // due to how the Blelloch scan works, the first element of the result is the identity element, so we compare with the offset
  for (let i = 0; i < arr1.length - 1; i++) {
    if (arr1[i] !== arr2[i + 1]) {
      console.log(`Mismatch at index ${i}: ${arr1[i]} !== ${arr2[i]}`);
      return false;
    }
  }
  return true;
}
