import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
  external: ["@iarna/toml", "yaml"],
  dts: true,
  sourcemap: false,
  clean: true,
  target: "node18",
  splitting: false,
});
