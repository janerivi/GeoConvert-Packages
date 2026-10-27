//! Friendly, dependency-free coordinate and GeoPose arithmetic.
//!
//! The crate uses degrees for latitude/longitude and metres for height, ECEF
//! and local ENU. It does not select datum transformations or mint operation
//! provenance; use the authoritative GeoConvert CLI for those operations.

mod geodesy;
mod geopose;

pub use geodesy::{
    Ecef, EcefInverseOptions, Ellipsoid, Enu, GeoConvertError, GeoConvertErrorCode, GeoPoint,
    GeodeticInverseResult, LatLonHeight, LocalFrame, Matrix3, WGS84_ELLIPSOID,
    ecef_to_enu_rotation, from_ecef, from_ecef_detailed, to_ecef, transpose_matrix3,
};
pub use geopose::{
    BasicQuaternionGeoPose, GeoPosePosition, GeoPoseQuaternion, LocalCameraPose,
    OGC_GEOPOSE_BASIC_QUATERNION_PROFILE, OGC_GEOPOSE_STANDARD_IDENTIFIER,
    OGC_GEOPOSE_STRICT_SCHEMA_URI, QuaternionXyzw, geopose_basic_quaternion_to_local_pose,
    local_pose_to_geopose_basic_quaternion,
};
