import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { GeoConvertClientError, createCliClient } from "../dist/node.js";

let directory;
let executable;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "geoconvert-cli-test-"));
  executable = join(directory, "fake-geoconvert.mjs");
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
const argv = process.argv.slice(2);
if (argv[0] === '--delay') {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  argv.shift();
}
const [command, ...args] = argv;
const option = (name) => args[args.indexOf(name) + 1];
if (command === 'capabilities') {
  await writeFile(option('--out'), JSON.stringify({ schema_version: '1.0.0', surfaces: ['cli'] }));
} else if (command === 'convert') {
  const request = JSON.parse(await readFile(args[0], 'utf8'));
  await writeFile(option('--out'), JSON.stringify({ schema_version: '1.0.0', coordinates: request.coordinates }));
  await writeFile(option('--receipt'), JSON.stringify({ schema_version: '1.0.0', result_hash: 'sha256:test' }));
} else {
  console.error(JSON.stringify({ schema_version: '1.0.0', code: 'unknown', message: 'unknown command', details: {} }));
  process.exit(2);
}
`,
    "utf8",
  );
  await chmod(executable, 0o755);
});

after(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe("Node CLI client", () => {
  it("uses an argument array without invoking a shell", async () => {
    const client = createCliClient({ command: [executable] });
    const request = { schema_version: "1.0.0", coordinates: [[1, 2, 3]] };
    const outcome = await client.convert(request);
    assert.deepEqual(outcome.result.coordinates, request.coordinates);
    assert.equal(outcome.receipt.result_hash, "sha256:test");
  });

  it("returns a stable unavailable error", async () => {
    const client = createCliClient({
      command: ["/definitely/missing/geoconvert"],
    });
    await assert.rejects(
      client.capabilities(),
      (error) =>
        error instanceof GeoConvertClientError &&
        error.code === "backend_unavailable",
    );
  });

  it("returns a stable timeout error", async () => {
    const client = createCliClient({
      command: [executable, "--delay"],
      timeoutMs: 10,
    });
    await assert.rejects(
      client.capabilities(),
      (error) =>
        error instanceof GeoConvertClientError &&
        error.code === "backend_timeout",
    );
  });

  it("rejects an empty JavaScript command before execution", () => {
    assert.throws(
      () => createCliClient({ command: [] }),
      /command must contain at least one executable/,
    );
  });
});
