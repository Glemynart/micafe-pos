import assert from "node:assert/strict";
import test from "node:test";
import { createRulesApiHeaders } from "./rules-api-headers";

test("Rules API requests include the explicit quota project", () => {
  assert.deepEqual(createRulesApiHeaders("micafe-pos", "test-token"), {
    Authorization: "Bearer test-token",
    "x-goog-user-project": "micafe-pos",
  });
});
