"use strict";

const { rmSync } = require("node:fs");
const { resolve } = require("node:path");

const packageDir = resolve(__dirname, "..");
const outputDir = resolve(packageDir, "lib");

rmSync(outputDir, { recursive: true, force: true });
