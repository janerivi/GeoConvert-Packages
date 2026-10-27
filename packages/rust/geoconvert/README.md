# `placeframe-geoconvert`

Friendly, dependency-free GeoConvert arithmetic for Rust. The API mirrors the
TypeScript package while following Rust naming and `Result` conventions.

```toml
[dependencies]
placeframe-geoconvert = { git = "https://github.com/janerivi/GeoConvert-Packages", tag = "rust-v0.1.0-alpha.1" }
```

```rust
use placeframe_geoconvert::{Enu, GeoPoint};

let origin = GeoPoint::from_lat_lon_height(
    40.71280972815316,
    -74.00600677999316,
    8.758042892441154,
)?;
let manhattan = origin.local_frame("frame-nyc-o1-v1")?;
let midtown = GeoPoint::from_local_enu(
    Enu {
        east: 1731.070133330654,
        north: 5019.627124527663,
        up: 12.786684010304,
    },
    &manhattan,
)?;

let ecef = midtown.to_ecef()?;
let round_trip = GeoPoint::from_ecef(ecef)?.to_local_enu(&manhattan)?;
# Ok::<(), placeframe_geoconvert::GeoConvertError>(())
```

`local_pose_to_geopose_basic_quaternion` and
`geopose_basic_quaternion_to_local_pose` provide the same generic OGC GeoPose
change of basis as the TypeScript package. They do not validate a Placeframe
`FrameDefinition` or datum-operation provenance.

Run the package lane with:

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo package --allow-dirty
```

The crate uses degrees for latitude/longitude and metres for ellipsoidal
height, ECEF and local ENU. Use the authoritative GeoConvert CLI for declared
CRS transformations, grids, geoids and operation records.
