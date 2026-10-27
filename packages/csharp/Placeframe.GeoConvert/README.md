# Placeframe.GeoConvert for Unity and C#

This Unity Package Manager package provides the same friendly double-precision
coordinate and OGC GeoPose arithmetic as `@placeframe/geoconvert` and the Rust
crate. It has no `UnityEngine` dependency, so the runtime assembly is usable in
ordinary C# projects as well as Unity.

```csharp
using Placeframe.GeoConvert;

GeoPoint origin = GeoPoint.FromLatLonHeight(
    40.71280972815316,
    -74.00600677999316,
    8.758042892441154);
LocalFrame manhattan = origin.LocalFrame("frame-nyc-o1-v1");

GeoPoint midtown = GeoPoint.FromLocalENU(
    new ENU(
        1731.070133330654,
        5019.627124527663,
        12.786684010304),
    manhattan);

ECEF ecef = midtown.ToECEF();
ENU roundTrip = GeoPoint.FromECEF(ecef).ToLocalENU(manhattan);
```

The API deliberately uses its own `double`-precision `ECEF` and `ENU` structs.
Convert to `UnityEngine.Vector3` only at a renderer seam, where float precision
and axis mapping are explicit.

Generic GeoPose conversion uses:

```csharp
BasicQuaternionGeoPose geoPose =
    GeoPoseMath.LocalPoseToGeoPoseBasicQuaternion(localPose, manhattan);
LocalCameraPose localAgain =
    GeoPoseMath.GeoPoseBasicQuaternionToLocalPose(geoPose, manhattan);
```

The generic kernel does not approve a Placeframe `FrameDefinition` or prove
G2296/epoch provenance. RnS3DCityEngine retains those governed checks.

Install the tagged source directly in Unity Package Manager:

```text
https://github.com/janerivi/GeoConvert-Packages.git?path=/packages/csharp/Placeframe.GeoConvert#unity-v0.1.0-pre.1
```

The matching release asset is a UPM-compatible `.tgz` for vendored/offline
use. The package requires Unity 2022.3 or later.

CI compiles and executes `Tests/DotNet` under .NET 8 without Unity dependencies.
Unity assembly metadata is defined in `Runtime/Placeframe.GeoConvert.asmdef`.
