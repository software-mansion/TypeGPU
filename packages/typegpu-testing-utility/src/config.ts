type Alias = {
  find: RegExp;
  replacement: string;
};

export function isTestingBuiltTypegpu() {
  return process.env.TEST_BUILT === '1' || process.env.TEST_BUILT === 'true';
}

export function typegpuBuiltAliases(): Alias[] {
  if (!isTestingBuiltTypegpu()) {
    return [];
  }

  return [
    {
      find: /^typegpu$/,
      replacement: 'typegpu/$built$',
    },
    {
      find: /^typegpu\/(?!package\.json$)(?!.*\/\$built\$$)(.+)$/,
      replacement: 'typegpu/$1/$built$',
    },
  ];
}
