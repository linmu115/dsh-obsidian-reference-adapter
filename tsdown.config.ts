import type { UserConfig } from "tsdown";

const bundled = ["dsh-annotation-core/protocol", "zod"];

export default [
  {
    entry: { index: "src/index.ts" },
    outDir: "lib",
    format: ["esm"],
    platform: "node",
    target: "es2024",
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: { alwaysBundle: bundled },
  },
  {
    entry: { client: "src/client/index.ts" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    target: "es2023",
    dts: false,
    clean: false,
    deps: {
      neverBundle: ["@deepseek-ai/cordis"],
      alwaysBundle: bundled,
    },
    outputOptions: {
      entryFileNames: "client.js",
      banner: "window.__ModuleLoader__.load({ id: \"dsh-obsidian-reference-adapter\", factory: (require) => {",
      intro: "var module = { exports: {} }; var exports = module.exports;",
      footer: "return module.exports; } });",
      codeSplitting: false,
    },
  },
] satisfies UserConfig[];
