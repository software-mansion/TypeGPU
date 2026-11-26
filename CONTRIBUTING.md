# Contributing

## Reporting Issues and Suggesting Features

If you encounter what you believe is a bug, please
[report an issue](https://github.com/software-mansion/TypeGPU/issues/new). For
suggesting new features, you should first
[start a discussion](https://github.com/software-mansion/TypeGPU/discussions/new/choose)
if one does not already exist. Feel free to also join and comment on
[existing discussions](https://github.com/software-mansion/TypeGPU/discussions).

## Development

To contribute by resolving an open issue or developing a new feature, please
adhere to the following workflow:

1. Fork this repository.
2. Create a new feature branch from the `main` branch.
3. **(tip)** Run the `pnpm dev` to start a local dev-server for the
   docs/examples/benchmarking app
4. Stage your changes and commit them. We recommend following the
   [Conventional Commit Specification](https://www.conventionalcommits.org/en/v1.0.0/)
   for commit messages.
5. Make sure all the tests pass when running `pnpm test`.
6. Submit the PR for review.

After your pull request is submitted, we will review it at as soon as possible.
We may suggest changes or request additional improvements, so please enable
[Allow edits from maintainers](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork)
on your PR.

## Release Checklist

### Preparing the release PR

1. Create a new branch from the latest `main`.
2. Run `pnpm run changes`. It fetches `origin` itself and compares `origin/main` with the latest release tag, so local
   `main` and `release` branches don't need to be up to date. It sorts the changed packages into:
   - **Packages to release:** public packages with changes to shipped code
   - **Already bumped:** versions that differ from the latest release
   - **Changed, but no release needed:** private packages, or packages where only tests, docs or configs changed
3. List everything that landed since the last release, for the release notes. Commits pushed straight to `release`
   (usually docs fixes) belong in the notes too, including ones that haven't been merged back into `main` yet:

   ```bash
   git log --oneline <last-tag>..origin/main
   git log --oneline <last-tag>..origin/release
   ```

4. Decide whether this is a **patch** or a **minor** release. While we're on 0.x, all packages in a release get the
   same kind of bump: either every bumped package gets a patch version, or every one gets a minor version. If you're an
   agent and weren't told which one, ask before bumping anything.
5. Bump the versions:
   - **Patch release:** run `pnpm run bump`. It patch-bumps every package from "Packages to release", plus packages
     that have to ship with them (packages that pin a bumped package exactly, and `@typegpu/cli`, which bakes in the
     versions of the other packages). It prints the PR title and the `Released packages:` list. Use
     `--skip <name>` to leave a package out (e.g. when its only change is removing dead code), and `--dry-run` to
     preview.
   - **Minor release:** run `pnpm run bump --dry-run` to see which packages need a release, then set their minor
     versions in `package.json` by hand.

   Then run `pnpm install`. If you left out a package that `pnpm run changes` listed under "Packages to release", note
   which one and why in the PR description (see step 6). Packages that `pnpm run changes` didn't list there don't need
   to be mentioned.

6. Open a draft PR titled `bump: typegpu <version> (+more)`, with the release notes as its description. Follow the
   format of the previous `bump:` PR:
   - `Released packages:` with each bumped package and its new version (`pnpm run bump` prints this list)
   - Right under that list, the packages from step 5 that you left out, and why. Skip this when there are none, and
     leave it out of the GitHub release in step 12
   - A short section (with a code snippet when it helps) for each notable change, ending with `* #<PR> by @<author>`
   - `## 💎 Features`, `## 🗿 Fixes / Stability` and `## 📖 Docs` lists with every PR from step 3, including the
     ones that landed on `release`
7. Take the Continuous Release build and test the changes on StackBlitz (optional)
8. Merge to main

### Publishing

9. Prepare each bumped package for publishing

```bash
cd packages/typegpu
pnpm publish --dry-run # (if alpha, --tag alpha)
```

10. If everything looks okay, then `pnpm publish` (if alpha, `--tag alpha`)

> **Tip:** If you already know all prepublish checks pass (tests, types, publish tag validation), you can skip them to speed up
> publishing:
>
> ```bash
> SKIP_TESTS=true pnpm publish # (if alpha, --tag alpha)
> ```

11. Rebase _release_ branch on _main_
12. Create the GitHub release, using the notes from the release PR
13. Run `npx automd@latest`
