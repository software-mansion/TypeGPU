import { properNames } from "../src/rules/properNames.ts";
import { ruleTester } from "./ruleTester.ts";

ruleTester.run("properNames", properNames, {
  valid: ["const myNumber = 10;"],
  invalid: [
    {
      code: "const AAA = 10;",
      errors: [
        { messageId: "badName", data: { name: "AAA" } },
      ],
    },
  ],
});
