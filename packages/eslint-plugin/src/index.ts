import fs from "node:fs";
import { properNames } from "./rules/properNames.ts";

const pkg = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

const plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    "proper-names": properNames,
  },
};

export default plugin;
