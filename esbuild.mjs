import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  sourcemap: true,
  minify: process.env.NODE_ENV === "production",
  logLevel: "info",
};

if (watch) {
  const watcher = await context(options);
  await watcher.watch();
} else {
  await build(options);
}
