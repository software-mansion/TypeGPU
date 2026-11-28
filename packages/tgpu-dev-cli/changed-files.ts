import { $ } from 'bun';

/**
 * Used as the base when no release tag can be found.
 */
export const FALLBACK_BASE = 'origin/release';

/**
 * Release tags are named after the version of `typegpu` (e.g. `v0.12.9`), and point at the
 * commit that bumped the versions of every package released at the time.
 */
const RELEASE_TAG_PATTERN = 'v[0-9]*';

/**
 * Matches refs that look like release tags (e.g. `v0.12.9`), the same way as {@link RELEASE_TAG_PATTERN}.
 */
const releaseTagRegex = /^v[0-9]/;

const packageDirnameRegex = /^packages\/([@\w-]+)\//;

export interface ChangedFilesOptions {
  /** The ref of the last release. Defaults to the latest release tag (see {@link resolveBase}). */
  base?: string | undefined;
  /** The ref with the changes to release. Defaults to `HEAD`. */
  head?: string | undefined;
  /** Whether to fetch release tags, remote refs (`origin/*`) and missing history before comparing. Defaults to `true`. */
  fetch?: boolean | undefined;
}

/**
 * Fetches `origin/<branch>` refs, so that comparisons aren't made against stale local branches,
 * and release tags, so that ones created (or missing, e.g. in shallow clones) since the last fetch can be used.
 * Failing to fetch (e.g. when offline) is not fatal, we then compare against what's available locally.
 */
async function fetchRemoteRefs(refs: string[]) {
  const refspecs = refs.flatMap((ref) => {
    if (ref.startsWith('origin/')) {
      const branch = ref.slice('origin/'.length);
      // An explicit refspec, because clones made with `--single-branch` (like the ones made by
      // actions/checkout) don't update `origin/<branch>` when fetching just by branch name.
      return [{ ref, refspec: `+refs/heads/${branch}:refs/remotes/origin/${branch}` }];
    }
    if (releaseTagRegex.test(ref)) {
      return [{ ref, refspec: `+refs/tags/${ref}:refs/tags/${ref}` }];
    }
    return [];
  });

  // Fetching one ref at a time (sequentially, since concurrent fetches compete for git's
  // lock files), so that a ref missing on the remote doesn't prevent the others from being fetched.
  for (const { ref, refspec } of refspecs) {
    const { exitCode } = await $`git fetch --no-tags --quiet origin ${refspec}`.nothrow().quiet();
    if (exitCode !== 0) {
      console.warn(`Could not fetch '${ref}' from origin, using the local one.`);
    }
  }
}

/**
 * Finds the latest release tag (by version, with prereleases sorted before their final release).
 */
export async function getLatestReleaseTag({ fetch = true }: { fetch?: boolean } = {}): Promise<
  string | undefined
> {
  if (fetch) {
    // Refspecs only support `*` as a wildcard, so this is looser than RELEASE_TAG_PATTERN.
    // Interpolated, so that the shell doesn't treat `*` as a glob.
    const refspec = '+refs/tags/v*:refs/tags/v*';
    const { exitCode } = await $`git fetch --quiet origin ${refspec}`.nothrow().quiet();
    if (exitCode !== 0) {
      console.warn('Could not fetch release tags from origin, using the local ones.');
    }
  }

  const tags =
    await $`git -c versionsort.suffix=- tag --list ${RELEASE_TAG_PATTERN} --sort=-version:refname`.text();
  return tags.split('\n').find(Boolean);
}

/**
 * Resolves the ref that changes are compared against. Unless one is given explicitly,
 * that's the latest release tag, which marks exactly what was last published.
 *
 * The `release` branch isn't a good default: commits can be made on it directly (e.g. docs fixes),
 * and once it's merged back into `main`, those commits would no longer count as changes,
 * even if they were never published.
 */
export async function resolveBase(
  base: string | undefined,
  { fetch = true }: { fetch?: boolean } = {},
): Promise<string> {
  if (base) {
    return base;
  }

  const tag = await getLatestReleaseTag({ fetch });
  if (!tag) {
    console.warn(`No release tags found, comparing against '${FALLBACK_BASE}' instead.`);
    return FALLBACK_BASE;
  }
  return tag;
}

async function hasMergeBase(base: string, head: string) {
  const { exitCode } = await $`git merge-base ${base} ${head}`.nothrow().quiet();
  return exitCode === 0;
}

async function isShallowRepository() {
  const stdout = await $`git rev-parse --is-shallow-repository`.text();
  return stdout.trim() === 'true';
}

/**
 * Lists files changed on `head` since it last diverged from `base` (`git diff base...head`).
 *
 * Using the merge base (instead of comparing the tips of both refs) means that
 * commits made only on `base` are not counted as changes on `head`.
 */
export async function getChangedFiles({
  base: baseOption,
  head = 'HEAD',
  fetch = true,
}: ChangedFilesOptions = {}): Promise<string[]> {
  const base = await resolveBase(baseOption, { fetch });

  if (fetch) {
    await fetchRemoteRefs([base, head]);
  }

  for (const ref of [base, head]) {
    const { exitCode } = await $`git rev-parse --verify --quiet ${`${ref}^{commit}`}`
      .nothrow()
      .quiet();
    if (exitCode !== 0) {
      throw new Error(`Unknown ref '${ref}'.`);
    }
  }

  if (fetch && !(await hasMergeBase(base, head)) && (await isShallowRepository())) {
    // CI usually checks out a shallow clone, which doesn't have the history needed to
    // find the merge base. Fetching the rest of the history fixes that.
    const { exitCode } = await $`git fetch --no-tags --quiet --unshallow origin`.nothrow().quiet();
    if (exitCode !== 0) {
      console.warn('Could not fetch the rest of the history from origin.');
    }
  }

  if (!(await hasMergeBase(base, head))) {
    throw new Error(`Could not find a common ancestor of '${base}' and '${head}'.`);
  }

  const stdout = await $`git diff --name-only ${`${base}...${head}`}`.text();
  return stdout.split('\n').filter(Boolean).toSorted();
}

/**
 * @param files Paths relative to the repository root.
 * @returns Names of the directories (inside `packages/`) of packages that contain any of the files.
 */
export function getPackageDirnames(files: string[]): string[] {
  const dirnames = new Set<string>();
  for (const file of files) {
    const dirname = packageDirnameRegex.exec(file)?.[1];
    if (dirname) {
      dirnames.add(dirname);
    }
  }
  return [...dirnames].toSorted();
}
