import { type AllowWarnDeny, defineConfig } from "oxlint";
import typegpu from "eslint-plugin-typegpu";

const typegpuPreset = typegpu.configs?.recommended;
const typegpuRules = typegpuPreset && "rules" in typegpuPreset ? typegpuPreset.rules : {};

export default defineConfig({
  plugins: ["typescript", "import", "unicorn", "oxc"],
  jsPlugins: ["eslint-plugin-typegpu"],
  categories: {
    correctness: "warn",
    suspicious: "warn",
  },
  rules: {
    ...typegpuRules,
  } as Record<string, AllowWarnDeny>,
  env: {
    builtin: true,
  },
});
