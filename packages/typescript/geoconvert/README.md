# `@placeframe/geoconvert`

Friendly, typed coordinate conversion for JavaScript, TypeScript and Node.js.

The package has two deliberately separate surfaces:

- the main import provides dependency-free WGS 84 geodetic, ECEF and local
  east/north/up arithmetic using degrees, metres and named objects;
- `@placeframe/geoconvert/node` calls the authoritative GeoConvert CLI for
  arbitrary declared-CRS transformations with operation provenance.

## Install from the GitHub release tarball

Pin the release asset URL in `package.json`:

```json
{
  "dependencies": {
    "@placeframe/geoconvert": "https://github.com/janerivi/GeoConvert-Packages/releases/download/typescript-v0.1.0-alpha.2/placeframe-geoconvert-0.1.0-alpha.2.tgz"
  }
}
```

Then run your normal package-manager install. Use the named release asset—not
GitHub's automatically generated source archive—because the asset contains the
compiled ESM and TypeScript declarations.

## Friendly Manhattan example

`GeoPoint` follows familiar `from...`/`to...` conventions while remaining
immutable:

```ts
import { GeoPoint } from "@placeframe/geoconvert";

const origin = GeoPoint.fromLatLonHeight(
  40.71280972815316,
  -74.00600677999316,
  8.758042892441154,
);
const manhattan = origin.localFrame("frame-nyc-o1-v1");

const midtown = GeoPoint.fromLocalENU(
  {
    east: 1731.070133330654,
    north: 5019.627124527663,
    up: 12.786684010304,
  },
  manhattan,
);

console.log(midtown.toECEF());
// {
//   x: 1334764.1266239272,
//   y: -4650435.647116686,
//   z: 4142119.930247306
// }

console.log(midtown.toLocalENU(manhattan));
```

The functional API is available when a wrapper object is unnecessary:

```ts
import { createLocalFrame, fromEcef, toEcef } from "@placeframe/geoconvert";

const ecef = toEcef({
  latitude: 40.71280972815316,
  longitude: -74.00600677999316,
  ellipsoidalHeight: 8.758042892441154,
});
const geographic = fromEcef(ecef);

const frame = createLocalFrame({
  id: "frame-nyc-o1-v1",
  origin: geographic,
});
const local = frame.fromEcef(ecef);
```

## Generic OGC GeoPose conversion

The package also converts a camera pose between a supplied local ENU frame and
OGC GeoPose Basic-Quaternion. It recomputes the pose-local ENU basis at the
output position, so an off-origin quaternion is never copied unchanged:

```ts
import {
  geoPoseBasicQuaternionToLocalPose,
  localPoseToGeoPoseBasicQuaternion,
} from "@placeframe/geoconvert";

const geopose = localPoseToGeoPoseBasicQuaternion(
  {
    position: {
      east: 1731.070133330654,
      north: 5019.627124527663,
      up: 12.786684010304,
    },
    // Camera-local directions -> Manhattan ENU, Hamilton xyzw.
    orientationXyzw: [0, 0, 0, 1],
  },
  manhattan,
);
const localPoseAgain = geoPoseBasicQuaternionToLocalPose(geopose, manhattan);
```

These functions perform frame mathematics only. An application-level adapter
must still retain the authoritative frame ID/hash, realization, coordinate
epoch and height provenance. `@rns3d/core` supplies that fail-closed governed
wrapper for Placeframe camera poses.

Latitude and longitude are degrees. ECEF and ENU components are metres. Height
is explicitly ellipsoidal; the API does not silently interpret it as elevation
above mean sea level.

## Authoritative CRS conversion from Node.js

Use the Node entry point when converting between declared coordinate reference
systems. It invokes a managed GeoConvert CLI without a shell and returns typed
result and receipt documents:

```ts
import type { ConversionRequest } from "@placeframe/geoconvert";
import { createCliClient } from "@placeframe/geoconvert/node";

const request = JSON.parse(
  await readFile("request.json", "utf8"),
) as ConversionRequest;
const client = createCliClient();
const { result, receipt } = await client.convert(request);

console.log(result.coordinates);
console.log(receipt.result_hash);
```

For a source checkout, fixed leading arguments are supported:

```ts
const client = createCliClient({ command: ["uv", "run", "geoconvert"] });
```

The client never falls back to different execution behavior. Missing
executables, timeouts and machine-readable GeoConvert failures become
`GeoConvertClientError` instances with stable `code`, `details` and `exitCode`
properties.

## What this alpha does not do

- The dependency-free arithmetic does not select a datum transformation,
  download grids, apply a geoid, or mint operation provenance. Use the CLI
  client for those operations.
- WGS 84 ellipsoid arithmetic is compatible with G2296 coordinates only when
  the caller has already established the realization and epoch. A plain
  latitude/longitude tuple does not prove that metadata.
- The generic GeoPose kernel does not validate a project `FrameDefinition` or
  provenance companion. RnS3DCityEngine retains those governed checks and the
  canonical Placeframe camera-pose contract.
- CommonJS is not emitted. The alpha package is ESM-first.

## Development and packaging

```sh
npm ci
npm run verify
npm pack
```

`npm run generate` derives the public request/result/receipt types from the
authoritative GeoConvert JSON Schema. CI rejects stale generated declarations.
