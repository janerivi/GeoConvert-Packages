import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type {
  CapabilityManifest,
  ConversionRequest,
  ConversionResult,
  GeoConvertError,
  ProductionReceipt,
} from "./generated/contracts.js";

const executeFile = promisify(execFile);

export interface CliClientOptions {
  /** Executable plus fixed leading arguments. Defaults to `['geoconvert']`. */
  readonly command?: readonly [string, ...string[]];
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
}

export interface ConversionOutcome {
  readonly result: ConversionResult;
  readonly receipt: ProductionReceipt;
}

export class GeoConvertClientError extends Error {
  readonly backend = "cli";
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly exitCode: number | undefined;

  constructor(
    code: string,
    message: string,
    options: {
      readonly details?: Readonly<Record<string, unknown>>;
      readonly exitCode?: number | undefined;
      readonly cause?: unknown;
    } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "GeoConvertClientError";
    this.code = code;
    this.details = options.details ?? {};
    this.exitCode = options.exitCode;
  }
}

export interface CliClient {
  readonly backend: "cli";
  capabilities(): Promise<CapabilityManifest>;
  convert(request: ConversionRequest): Promise<ConversionOutcome>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDocument(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new GeoConvertClientError(
      "invalid_backend_response",
      `${label} is not valid JSON`,
      {
        cause: error,
      },
    );
  }
  if (!isObject(value)) {
    throw new GeoConvertClientError(
      "invalid_backend_response",
      `${label} must be a JSON object`,
    );
  }
  return value;
}

function parseCliError(
  stderr: string,
  exitCode: number | undefined,
  cause: unknown,
): never {
  const lastLine = stderr
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (lastLine !== undefined) {
    try {
      const document = JSON.parse(lastLine) as unknown;
      if (isObject(document) && typeof document.code === "string") {
        const typed = document as unknown as GeoConvertError;
        throw new GeoConvertClientError(typed.code, typed.message, {
          details: typed.details,
          exitCode,
          cause,
        });
      }
    } catch (error) {
      if (error instanceof GeoConvertClientError) throw error;
    }
  }
  throw new GeoConvertClientError(
    "backend_failure",
    "GeoConvert CLI failed without a machine-readable error",
    { exitCode, cause },
  );
}

/** Create a Node client for an installed or otherwise managed GeoConvert CLI. */
export function createCliClient(options: CliClientOptions = {}): CliClient {
  const command = options.command ?? ["geoconvert"];
  const timeout = options.timeoutMs ?? 30_000;
  const maxBuffer = options.maxBufferBytes ?? 128 * 1024 * 1024;
  if (command.length === 0) {
    throw new TypeError("command must contain at least one executable");
  }
  if (
    command.some(
      (part) =>
        typeof part !== "string" || part.length === 0 || part.includes("\0"),
    )
  ) {
    throw new TypeError(
      "command must contain non-empty arguments without null bytes",
    );
  }
  const [executable, ...leadingArguments] = command;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new RangeError("timeoutMs must be a finite positive number");
  }
  if (!Number.isSafeInteger(maxBuffer) || maxBuffer <= 0) {
    throw new RangeError("maxBufferBytes must be a positive safe integer");
  }

  const run = async (arguments_: readonly string[]): Promise<void> => {
    try {
      await executeFile(executable, [...leadingArguments, ...arguments_], {
        encoding: "utf8",
        maxBuffer,
        timeout,
      });
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & {
        readonly code?: string | number;
        readonly killed?: boolean;
        readonly signal?: string;
        readonly stderr?: string;
      };
      if (failure.code === "ENOENT") {
        throw new GeoConvertClientError(
          "backend_unavailable",
          "GeoConvert CLI was not found",
          {
            cause: error,
          },
        );
      }
      if (
        failure.code === "ETIMEDOUT" ||
        (failure.killed === true && failure.signal === "SIGTERM")
      ) {
        throw new GeoConvertClientError(
          "backend_timeout",
          "GeoConvert CLI exceeded timeoutMs",
          {
            cause: error,
          },
        );
      }
      const exitCode =
        typeof failure.code === "number" ? failure.code : undefined;
      parseCliError(failure.stderr ?? "", exitCode, error);
    }
  };

  const withDirectory = async <T>(
    operation: (directory: string) => Promise<T>,
  ): Promise<T> => {
    const directory = await mkdtemp(join(tmpdir(), "geoconvert-ts-"));
    try {
      return await operation(directory);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  };

  return Object.freeze({
    backend: "cli" as const,
    capabilities: () =>
      withDirectory(async (directory) => {
        const output = join(directory, "capabilities.json");
        await run(["capabilities", "--out", output]);
        return parseDocument(
          await readFile(output, "utf8"),
          "capabilities",
        ) as unknown as CapabilityManifest;
      }),
    convert: (request: ConversionRequest) =>
      withDirectory(async (directory) => {
        const requestPath = join(directory, "request.json");
        const resultPath = join(directory, "result.json");
        const receiptPath = join(directory, "receipt.json");
        await writeFile(requestPath, `${JSON.stringify(request)}\n`, "utf8");
        await run([
          "convert",
          requestPath,
          "--out",
          resultPath,
          "--receipt",
          receiptPath,
        ]);
        const result = parseDocument(
          await readFile(resultPath, "utf8"),
          "conversion result",
        ) as unknown as ConversionResult;
        const receipt = parseDocument(
          await readFile(receiptPath, "utf8"),
          "production receipt",
        ) as unknown as ProductionReceipt;
        return Object.freeze({ result, receipt });
      }),
  });
}
