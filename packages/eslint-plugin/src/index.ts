import fs from "node:fs";
import { integerDivision } from "./rules/integerDivision.ts";

const pkg = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

const plugin = {
  meta: {
    name: pkg.name,
    version: pkg.version,
  },
  rules: {
    "integer-division": integerDivision,
  },
};

export default plugin;
