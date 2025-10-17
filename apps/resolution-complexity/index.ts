import { type SimpleGit, simpleGit } from 'simple-git';
import fs from 'fs-extra';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const promisifiedExec = promisify(exec);
const pwd = import.meta.dirname;

const GITHUB = 'https://github.com/software-mansion/TypeGPU.git';
const SCRIPT_TO_RUN = 'pnpm run test:browser';
// this is relative to root of the cloned release
const COPY_PATH = 'apps/typegpu-docs/tests/artifacts/example-benchmark.json';
// this is relative to app's root
const TEMP_DIR = path.join(pwd, '/tmp');
// this is relative to app's root
const OUTPUT_FILE = 'results.json';

async function processReleases() {
  let git: SimpleGit;
  const results: Record<
    string,
    ({
      'resolveDuration': number;
      'compileDuration': number;
      'wgslSize': number;
    })[]
  > = {};

  try {
    console.log(`Creating temporary directory at: ${TEMP_DIR}`);
    await fs.ensureDir(TEMP_DIR);

    git = simpleGit();

    console.log(`Fetching tags from ${GITHUB}...`);
    const tagsResult = await git.listRemote(['--tags', GITHUB]);
    if (!tagsResult) {
      throw new Error('Could not fetch tags from the repository.');
    }

    const tags = tagsResult
      .split('\n')
      .map((line) => line.split('refs/tags/').pop()?.trim())
      .filter((tag): tag is string =>
        !!tag && !tag.includes('{}') && !tag.includes('alpha') &&
        tag.localeCompare('v0.7.1') >= 0
      )
      .sort();

    for (const tag of tags) {
      // =========== PREPARE PATH ===========
      const repoPath = path.join(TEMP_DIR, tag);
      console.log(`-- Processing tag: ${tag}`);

      // =========== CLONE REPO ===========
      try {
        console.log(`-- Cloning tag ${tag}...`);
        await git.clone(GITHUB, repoPath, ['--depth=1', `--branch=${tag}`]);
      } catch (error) {
        console.log(`-- Cloning tag ${tag} failed.`);
      }

      // =========== RUN SCRIPT ===========
      try {
        console.log(`-- Running ${SCRIPT_TO_RUN}...`);
        await promisifiedExec(SCRIPT_TO_RUN, {
          cwd: repoPath,
        });
      } catch (error) {
        console.log(`-- Running ${SCRIPT_TO_RUN} failed.`);
      }

      // =========== INNER CLEANUP ===========
      console.log('-- Processing complete!');

      await fs.remove(repoPath);

      console.log(`-- Deleted tag ${tag}...`);
    }
  } catch (error) {
    console.error('Something went wrong in outer try-catch.', error);
  } finally {
    await fs.remove(TEMP_DIR);
  }
}

// processReleases();
