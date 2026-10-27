import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { compile } from "json-schema-to-typescript";
import { format } from "prettier";

const packageRoot = resolve(import.meta.dirname, "..");
const repositoryRoot = resolve(packageRoot, "../../..");
const schemaPath = resolve(
  repositoryRoot,
  "contracts/schemas/geoconvert.schema.json",
);
const outputPath = resolve(packageRoot, "src/generated/contracts.ts");
const check = process.argv.includes("--check");

const bundle = JSON.parse(await readFile(schemaPath, "utf8"));
const publicDefinitions = [
  "ConversionRequest",
  "ConversionResult",
  "ProductionReceipt",
  "CapabilityManifest",
  "GeoConvertError",
];
const documentSchema = {
  ...bundle,
  title: "GeoConvertDocument",
  oneOf: publicDefinitions.map((name) => ({ $ref: `#/$defs/${name}` })),
};

const compiled = await compile(documentSchema, "GeoConvertDocument", {
  bannerComment:
    "/* Generated from contracts/schemas/geoconvert.schema.json. Do not edit by hand. */",
  declareExternallyReferenced: true,
  enableConstEnums: false,
  style: {
    bracketSpacing: true,
    printWidth: 100,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: "all",
    useTabs: false,
  },
  unknownAny: false,
});
const generated = await format(compiled, { parser: "typescript" });

if (check) {
  const committed = await readFile(outputPath, "utf8");
  if (committed !== generated) {
    throw new Error(
      "Generated contract types are stale; run `npm run generate`.",
    );
  }
} else {
  await writeFile(outputPath, generated, "utf8");
}
