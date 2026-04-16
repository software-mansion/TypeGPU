export const TEST_BUILT_CODE = process.env.TEST_BUILT_CODE
  ? { true: true, false: false }[process.env.TEST_BUILT_CODE]
  : undefined;
