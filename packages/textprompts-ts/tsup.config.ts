import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
  external: ["fast-glob", "@iarna/toml", "yaml"],
  dts: true,
  sourcemap: false,
  clean: true,
  target: "node18",
  splitting: false,
});
