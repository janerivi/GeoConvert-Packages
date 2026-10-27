# GeoConvert packages

Public, version-pinned distribution sources and release archives for the
Placeframe GeoConvert binding family. The TypeScript, Rust and Unity/C# APIs use
the same names and the same frozen Manhattan coordinate/GeoPose controls.

All coordinate methods use degrees for latitude/longitude and metres for
ellipsoidal height, ECEF and local east/north/up (ENU). The generic GeoPose
methods convert between a supplied local ENU frame and OGC Basic-Quaternion.

These packages provide coordinate arithmetic. They do not select datum/grid
operations or mint transformation provenance; use the authoritative GeoConvert
CLI for declared CRS transformations.

## TypeScript and Node.js

Pin the release archive in `package.json`:

```json
{
  "dependencies": {
    "@placeframe/geoconvert": "https://github.com/janerivi/GeoConvert-Packages/releases/download/typescript-v0.1.0-alpha.2/placeframe-geoconvert-0.1.0-alpha.2.tgz"
  }
}
```

The package exports the friendly in-process API from `@placeframe/geoconvert`
and the authoritative CLI client from `@placeframe/geoconvert/node`.

## Rust

Pin the source tag in `Cargo.toml`:

```toml
[dependencies]
placeframe-geoconvert = { git = "https://github.com/janerivi/GeoConvert-Packages", tag = "rust-v0.1.0-alpha.1" }
```

The matching `.crate` release asset supports vendored and offline builds.

## Unity and C#

Add this URL in Unity Package Manager:

```text
https://github.com/janerivi/GeoConvert-Packages.git?path=/packages/csharp/Placeframe.GeoConvert#unity-v0.1.0-pre.1
```

The runtime uses `double` and has no `UnityEngine` dependency. A matching UPM
`.tgz` is available for vendored and offline projects.

## API shape

Every language provides concise latitude/longitude/height, ECEF and ENU value
types, a `GeoPoint`, a reusable local frame, forward/reverse conversions, and a
generic local-pose/GeoPose pair. See each package README for its idiomatic
spelling and the complete Manhattan example.

Released under the Apache License 2.0.
