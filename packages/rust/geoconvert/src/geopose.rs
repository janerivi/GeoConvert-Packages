use crate::geodesy::{
    EcefInverseOptions, Enu, GeoConvertError, GeoConvertErrorCode, LatLonHeight, LocalFrame,
    Matrix3, from_ecef_detailed, transpose_matrix3,
};

pub const OGC_GEOPOSE_STANDARD_IDENTIFIER: &str = "OGC 21-056r11";
pub const OGC_GEOPOSE_BASIC_QUATERNION_PROFILE: &str =
    "/conf/basic-quaternion-encoding-json-strict";
pub const OGC_GEOPOSE_STRICT_SCHEMA_URI: &str =
    "https://schemas.opengis.net/geopose/1.0/schemata/GeoPose.Basic.Strict_Quaternion.Schema.json";

pub type QuaternionXyzw = [f64; 4];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LocalCameraPose {
    pub position: Enu,
    /// Camera-local direction coordinates to the supplied local ENU frame.
    pub orientation_xyzw: QuaternionXyzw,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GeoPosePosition {
    pub lat: f64,
    pub lon: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GeoPoseQuaternion {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BasicQuaternionGeoPose {
    pub position: GeoPosePosition,
    pub quaternion: GeoPoseQuaternion,
}

const UNIT_QUATERNION_NORM_TOLERANCE: f64 = 1e-12;

fn positive_zero(value: f64) -> f64 {
    if value == 0.0 { 0.0 } else { value }
}

fn canonicalize_sign(quaternion: QuaternionXyzw) -> Result<QuaternionXyzw, GeoConvertError> {
    if quaternion.iter().any(|component| !component.is_finite()) {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::NotFinite,
            "orientation_xyzw",
            "quaternion components must be finite",
        ));
    }
    let [x, y, z, w] = quaternion;
    let half_turn = if w == 0.0 {
        [x, y, z]
            .into_iter()
            .find(|value| *value != 0.0)
            .unwrap_or(1.0)
    } else {
        1.0
    };
    let sign = if w < 0.0 || (w == 0.0 && half_turn < 0.0) {
        -1.0
    } else {
        1.0
    };
    Ok([
        positive_zero(sign * x),
        positive_zero(sign * y),
        positive_zero(sign * z),
        positive_zero(sign * w),
    ])
}

fn normalize(quaternion: QuaternionXyzw) -> Result<QuaternionXyzw, GeoConvertError> {
    let norm = quaternion
        .iter()
        .map(|value| value * value)
        .sum::<f64>()
        .sqrt();
    if !norm.is_finite() || norm <= 1e-15 {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::OutOfRange,
            "orientation_xyzw",
            "quaternion must be finite and non-zero",
        ));
    }
    canonicalize_sign([
        quaternion[0] / norm,
        quaternion[1] / norm,
        quaternion[2] / norm,
        quaternion[3] / norm,
    ])
}

fn canonicalize_unit(quaternion: QuaternionXyzw) -> Result<QuaternionXyzw, GeoConvertError> {
    if quaternion.iter().any(|component| !component.is_finite()) {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::NotFinite,
            "orientation_xyzw",
            "quaternion components must be finite",
        ));
    }
    let norm = quaternion
        .iter()
        .map(|value| value * value)
        .sum::<f64>()
        .sqrt();
    if (norm - 1.0).abs() > UNIT_QUATERNION_NORM_TOLERANCE {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::OutOfRange,
            "orientation_xyzw",
            format!(
                "quaternion norm {norm} exceeds the canonical tolerance {UNIT_QUATERNION_NORM_TOLERANCE}"
            ),
        ));
    }
    canonicalize_sign(quaternion)
}

fn multiply_matrix3(left: Matrix3, right: Matrix3) -> Matrix3 {
    [
        left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
        left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
        left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
        left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
        left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
        left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
        left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
        left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
        left[6] * right[2] + left[7] * right[5] + left[8] * right[8],
    ]
}

fn quaternion_to_matrix(quaternion: QuaternionXyzw) -> Result<Matrix3, GeoConvertError> {
    let [x, y, z, w] = normalize(quaternion)?;
    Ok([
        1.0 - 2.0 * (y * y + z * z),
        2.0 * (x * y - z * w),
        2.0 * (x * z + y * w),
        2.0 * (x * y + z * w),
        1.0 - 2.0 * (x * x + z * z),
        2.0 * (y * z - x * w),
        2.0 * (x * z - y * w),
        2.0 * (y * z + x * w),
        1.0 - 2.0 * (x * x + y * y),
    ])
}

fn matrix_to_quaternion(matrix: Matrix3) -> Result<QuaternionXyzw, GeoConvertError> {
    let trace = matrix[0] + matrix[4] + matrix[8];
    let (x, y, z, w);
    if trace > 0.0 {
        let scale = (trace + 1.0).sqrt() * 2.0;
        w = scale / 4.0;
        x = (matrix[7] - matrix[5]) / scale;
        y = (matrix[2] - matrix[6]) / scale;
        z = (matrix[3] - matrix[1]) / scale;
    } else if matrix[0] > matrix[4] && matrix[0] > matrix[8] {
        let scale = (1.0 + matrix[0] - matrix[4] - matrix[8]).sqrt() * 2.0;
        w = (matrix[7] - matrix[5]) / scale;
        x = scale / 4.0;
        y = (matrix[1] + matrix[3]) / scale;
        z = (matrix[2] + matrix[6]) / scale;
    } else if matrix[4] > matrix[8] {
        let scale = (1.0 + matrix[4] - matrix[0] - matrix[8]).sqrt() * 2.0;
        w = (matrix[2] - matrix[6]) / scale;
        x = (matrix[1] + matrix[3]) / scale;
        y = scale / 4.0;
        z = (matrix[5] + matrix[7]) / scale;
    } else {
        let scale = (1.0 + matrix[8] - matrix[0] - matrix[4]).sqrt() * 2.0;
        w = (matrix[3] - matrix[1]) / scale;
        x = (matrix[2] + matrix[6]) / scale;
        y = (matrix[5] + matrix[7]) / scale;
        z = scale / 4.0;
    }
    normalize([x, y, z, w])
}

pub fn local_pose_to_geopose_basic_quaternion(
    pose: LocalCameraPose,
    project_frame: &LocalFrame,
) -> Result<BasicQuaternionGeoPose, GeoConvertError> {
    let orientation = canonicalize_unit(pose.orientation_xyzw)?;
    let geodetic = from_ecef_detailed(
        project_frame.to_ecef(pose.position)?,
        EcefInverseOptions {
            ellipsoid: project_frame.ellipsoid(),
            ..EcefInverseOptions::default()
        },
    )?
    .position;
    let pose_frame = LocalFrame::with_ellipsoid(None, geodetic, project_frame.ellipsoid())?;
    let rotation_pose_enu_camera = multiply_matrix3(
        multiply_matrix3(
            pose_frame.ecef_to_enu_rotation(),
            transpose_matrix3(project_frame.ecef_to_enu_rotation()),
        ),
        quaternion_to_matrix(orientation)?,
    );
    let [x, y, z, w] = matrix_to_quaternion(transpose_matrix3(rotation_pose_enu_camera))?;
    Ok(BasicQuaternionGeoPose {
        position: GeoPosePosition {
            lat: geodetic.latitude,
            lon: geodetic.longitude,
            h: geodetic.ellipsoidal_height,
        },
        quaternion: GeoPoseQuaternion { x, y, z, w },
    })
}

pub fn geopose_basic_quaternion_to_local_pose(
    geopose: BasicQuaternionGeoPose,
    project_frame: &LocalFrame,
) -> Result<LocalCameraPose, GeoConvertError> {
    let pose_frame = LocalFrame::with_ellipsoid(
        None,
        LatLonHeight {
            latitude: geopose.position.lat,
            longitude: geopose.position.lon,
            ellipsoidal_height: geopose.position.h,
        },
        project_frame.ellipsoid(),
    )?;
    let camera_pose_enu = canonicalize_unit([
        geopose.quaternion.x,
        geopose.quaternion.y,
        geopose.quaternion.z,
        geopose.quaternion.w,
    ])?;
    let rotation_pose_enu_camera = transpose_matrix3(quaternion_to_matrix(camera_pose_enu)?);
    let rotation_project_enu_camera = multiply_matrix3(
        multiply_matrix3(
            project_frame.ecef_to_enu_rotation(),
            transpose_matrix3(pose_frame.ecef_to_enu_rotation()),
        ),
        rotation_pose_enu_camera,
    );
    Ok(LocalCameraPose {
        position: project_frame.from_ecef(pose_frame.origin_ecef())?,
        orientation_xyzw: matrix_to_quaternion(rotation_project_enu_camera)?,
    })
}
