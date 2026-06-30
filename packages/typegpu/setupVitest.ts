import { setup } from '@ark/attest';
import { type } from 'arktype';
import { readFileSync, writeFileSync } from 'node:fs';

const truthyString = type('"0"|"1"|"true"|"false"').pipe.try(
  (value) => value === '1' || value === 'true',
);

const ProcessEnvType = type({
  'ENABLE_ATTEST?': type.or(truthyString, 'undefined'),
  'TEST_BUILT?': type.or(truthyString, 'undefined'),
});

const env = ProcessEnvType.assert(process.env);

const packageJsonUrl = new URL('./package.json', import.meta.url);

type PackageJson = Record<string, unknown> & {
  publishConfig?: Record<string, unknown>;
};

function usePublishConfig() {
  const originalPackageJson = readFileSync(packageJsonUrl, 'utf8');
  const packageJson = JSON.parse(originalPackageJson) as PackageJson;

  writeFileSync(
    packageJsonUrl,
    `${JSON.stringify(
      {
        ...packageJson,
        ...packageJson.publishConfig,
      },
      null,
      2,
    )}\n`,
  );

  return () => {
    writeFileSync(packageJsonUrl, originalPackageJson);
  };
}

export default () => {
  const restorePackageJson = env.TEST_BUILT ? usePublishConfig() : undefined;
  let teardownAttest: ReturnType<typeof setup>;

  try {
    teardownAttest = setup({
      formatCmd: 'pnpm fix',
      // Skipping type tests by default
      skipTypes: !env.ENABLE_ATTEST,
    });
  } catch (error) {
    restorePackageJson?.();
    throw error;
  }

  return () => {
    try {
      teardownAttest();
    } finally {
      restorePackageJson?.();
    }
  };
};
