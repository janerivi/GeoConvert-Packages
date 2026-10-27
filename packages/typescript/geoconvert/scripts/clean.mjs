import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");

await Promise.all([
  rm(resolve(packageRoot, "dist"), { force: true, recursive: true }),
  rm(resolve(packageRoot, ".test-dist"), { force: true, recursive: true }),
]);
