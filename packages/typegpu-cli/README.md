# @typegpu/cli
Create a new TypeGPU project or enhance an existing one.

## Creating
To run interactive project scaffolding:

```sh
pnpm dlx typegpu@latest
# or
npx typegpu@latest
# or
yarn dlx typegpu@latest
# or
bunx typegpu@latest
```

To scaffold with defaults without prompts:

```sh
npx typegpu@latest my-app --yes
```

You can also choose a template and optional TypeGPU add-ons explicitly:

```sh
npx typegpu@latest my-app --yes --template vite-react --addons @typegpu/sdf,@typegpu/noise
```

Available templates: `vite-bare`, `vite-complex`, `vite-react`, `expo-bare`.

## Enhancing
Run inside the root of an existing project:

```sh
pnpm dlx typegpu@latest -e
# or
npx typegpu@latest -e
# or
yarn dlx typegpu@latest -e
# or
bunx typegpu@latest -e
```

To run the standard enhance flow without prompts:

```sh
npx typegpu@latest --enhance --yes
```

You can also pass the project directory explicitly:

```sh
npx typegpu@latest my-app --enhance --yes
```

To include optional add-ons while enhancing:

```sh
npx typegpu@latest --enhance --yes --addons @typegpu/sdf,@typegpu/noise
```

The TypeGPU agent skill is included automatically when using `--yes`.

If the CLI cannot detect a package manager, pass `--package-manager npm`, `pnpm`, `pnpm@6`, `yarn`, `yarn@berry`, or `bun`.

> [!CAUTION]
> **Back up your project before running the enhance flow.** The changes the script makes are not reversible by it.
