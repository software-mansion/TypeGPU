# Contributing

## Reporting Issues and Suggesting Features
If you encounter what you believe is a bug, please [report an issue](https://github.com/software-mansion/TypeGPU/issues/new). For suggesting new features, you should first [start a discussion](https://github.com/software-mansion/TypeGPU/discussions/new/choose) if one does not already exist. Feel free to also join and comment on [existing discussions](https://github.com/software-mansion/TypeGPU/discussions).


## Development

To contribute by resolving an open issue or developing a new feature, please adhere to the following workflow:

1. Fork this repository.
2. Create a new feature branch from the `main` branch.
3. Ensure that the `pnpm dev` script is running at all times during development.
4. Stage your changes and commit them. We recommend following the [Conventional Commit Specification](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages.
5. Make sure all the tests pass when running `pnpm test`.
6. Submit the PR for review.

After your pull request is submitted, we will review it at as soon as possible. We may suggest changes or request additional improvements, so please enable [Allow edits from maintainers](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/proposing-changes-to-your-work-with-pull-requests/creating-a-pull-request-from-a-fork) on your PR.


## Release To-Do

1. Create new branch, update package number in package.json, run `pnpm install`
2. Take the built package from code sandbox CI and test the changes on StackBlitz (optional)
3. Merge to main
4. `cd packages/typegpu`
5. `pnpm prepare-package`
6. `cd dist`
7. `pnpm publish —dry-run` (if alpha, then add tag alpha)
8. If everything looks okay, then `pnpm publish` (if alpha, then add tag alpha)
9.  Rebase release branch on main
10. Generate and edit release notes on GitHub