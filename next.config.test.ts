import assert from "node:assert/strict"
import test from "node:test"

import nextConfig from "./next.config.mjs"

test("keeps browser source maps disabled and disables server source maps in production", () => {
  assert.notEqual(nextConfig.productionBrowserSourceMaps, true)
  assert.equal(nextConfig.experimental?.serverSourceMaps, false)
})
