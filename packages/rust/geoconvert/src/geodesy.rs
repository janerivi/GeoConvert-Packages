use std::error::Error;
use std::fmt::{Display, Formatter};

pub type Matrix3 = [f64; 9];

const DEFAULT_TOLERANCE_RADIANS: f64 = 1e-13;
const DEFAULT_MAX_ITERATIONS: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LatLonHeight {
    pub latitude: f64,
    pub longitude: f64,
    pub ellipsoidal_height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ecef {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Enu {
    pub east: f64,
    pub north: f64,
    pub up: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Ellipsoid {
    pub id: &'static str,
    pub semi_major_axis_m: f64,
    pub inverse_flattening: f64,
}

pub const WGS84_ELLIPSOID: Ellipsoid = Ellipsoid {
    id: "EPSG:7030",
    semi_major_axis_m: 6_378_137.0,
    inverse_flattening: 298.257_223_563,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GeoConvertErrorCode {
    NotFinite,
    OutOfRange,
    InvalidEcefOrigin,
    NonConvergent,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GeoConvertError {
    pub code: GeoConvertErrorCode,
    pub field: &'static str,
    pub message: String,
}

impl GeoConvertError {
    pub(crate) fn new(
        code: GeoConvertErrorCode,
        field: &'static str,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            field,
            message: message.into(),
        }
    }
}

impl Display for GeoConvertError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}: {}", self.field, self.message)
    }
}

impl Error for GeoConvertError {}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct EcefInverseOptions {
    pub ellipsoid: Ellipsoid,
    pub tolerance_radians: f64,
    pub max_iterations: usize,
}

impl Default for EcefInverseOptions {
    fn default() -> Self {
        Self {
            ellipsoid: WGS84_ELLIPSOID,
            tolerance_radians: DEFAULT_TOLERANCE_RADIANS,
            max_iterations: DEFAULT_MAX_ITERATIONS,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GeodeticInverseResult {
    pub position: LatLonHeight,
    pub algorithm: &'static str,
    pub iterations: usize,
    pub tolerance_radians: f64,
}

fn finite(field: &'static str, value: f64) -> Result<f64, GeoConvertError> {
    if value.is_finite() {
        Ok(value)
    } else {
        Err(GeoConvertError::new(
            GeoConvertErrorCode::NotFinite,
            field,
            "must be a finite number",
        ))
    }
}

fn ellipsoid_terms(ellipsoid: Ellipsoid) -> Result<(f64, f64), GeoConvertError> {
    let semi_major = finite("ellipsoid.semi_major_axis_m", ellipsoid.semi_major_axis_m)?;
    let inverse_flattening = finite("ellipsoid.inverse_flattening", ellipsoid.inverse_flattening)?;
    if semi_major <= 0.0 {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::OutOfRange,
            "ellipsoid.semi_major_axis_m",
            "must be positive",
        ));
    }
    if inverse_flattening <= 1.0 {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::OutOfRange,
            "ellipsoid.inverse_flattening",
            "must be greater than one",
        ));
    }
    let flattening = 1.0 / inverse_flattening;
    Ok((
        semi_major * (1.0 - flattening),
        flattening * (2.0 - flattening),
    ))
}

fn geodetic_radians(position: LatLonHeight) -> Result<[f64; 3], GeoConvertError> {
    let latitude = finite("latitude", position.latitude)?;
    let longitude = finite("longitude", position.longitude)?;
    let height = finite("ellipsoidal_height", position.ellipsoidal_height)?;
    if !(-90.0..=90.0).contains(&latitude) {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::OutOfRange,
            "latitude",
            "must be between -90 and 90",
        ));
    }
    if !(-180.0..=180.0).contains(&longitude) {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::OutOfRange,
            "longitude",
            "must be between -180 and 180",
        ));
    }
    Ok([latitude.to_radians(), longitude.to_radians(), height])
}

fn ecef_values(position: Ecef) -> Result<[f64; 3], GeoConvertError> {
    Ok([
        finite("x", position.x)?,
        finite("y", position.y)?,
        finite("z", position.z)?,
    ])
}

fn enu_values(position: Enu) -> Result<[f64; 3], GeoConvertError> {
    Ok([
        finite("east", position.east)?,
        finite("north", position.north)?,
        finite("up", position.up)?,
    ])
}

fn multiply_matrix_vector(matrix: Matrix3, vector: [f64; 3]) -> [f64; 3] {
    [
        matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
        matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
        matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
    ]
}

pub fn transpose_matrix3(matrix: Matrix3) -> Matrix3 {
    [
        matrix[0], matrix[3], matrix[6], matrix[1], matrix[4], matrix[7], matrix[2], matrix[5],
        matrix[8],
    ]
}

fn ecef_to_enu_rotation_radians(latitude: f64, longitude: f64) -> Matrix3 {
    let (sin_latitude, cos_latitude) = latitude.sin_cos();
    let (sin_longitude, cos_longitude) = longitude.sin_cos();
    [
        -sin_longitude,
        cos_longitude,
        0.0,
        -sin_latitude * cos_longitude,
        -sin_latitude * sin_longitude,
        cos_latitude,
        cos_latitude * cos_longitude,
        cos_latitude * sin_longitude,
        sin_latitude,
    ]
}

pub fn ecef_to_enu_rotation(
    latitude_degrees: f64,
    longitude_degrees: f64,
) -> Result<Matrix3, GeoConvertError> {
    let [latitude, longitude, _] = geodetic_radians(LatLonHeight {
        latitude: latitude_degrees,
        longitude: longitude_degrees,
        ellipsoidal_height: 0.0,
    })?;
    Ok(ecef_to_enu_rotation_radians(latitude, longitude))
}

pub fn to_ecef(position: LatLonHeight) -> Result<Ecef, GeoConvertError> {
    to_ecef_on(position, WGS84_ELLIPSOID)
}

pub fn to_ecef_on(position: LatLonHeight, ellipsoid: Ellipsoid) -> Result<Ecef, GeoConvertError> {
    let [latitude, longitude, height] = geodetic_radians(position)?;
    let (_, eccentricity_squared) = ellipsoid_terms(ellipsoid)?;
    let (sin_latitude, cos_latitude) = latitude.sin_cos();
    let radius = ellipsoid.semi_major_axis_m
        / (1.0 - eccentricity_squared * sin_latitude * sin_latitude).sqrt();
    Ok(Ecef {
        x: (radius + height) * cos_latitude * longitude.cos(),
        y: (radius + height) * cos_latitude * longitude.sin(),
        z: (radius * (1.0 - eccentricity_squared) + height) * sin_latitude,
    })
}

pub fn from_ecef(position: Ecef) -> Result<LatLonHeight, GeoConvertError> {
    Ok(from_ecef_detailed(position, EcefInverseOptions::default())?.position)
}

pub fn from_ecef_detailed(
    position: Ecef,
    options: EcefInverseOptions,
) -> Result<GeodeticInverseResult, GeoConvertError> {
    let (semi_minor, eccentricity_squared) = ellipsoid_terms(options.ellipsoid)?;
    if !options.tolerance_radians.is_finite() || options.tolerance_radians <= 0.0 {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::OutOfRange,
            "tolerance_radians",
            "must be a finite positive number",
        ));
    }
    if options.max_iterations == 0 {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::OutOfRange,
            "max_iterations",
            "must be positive",
        ));
    }
    let [x, y, z] = ecef_values(position)?;
    let distance_from_axis = x.hypot(y);
    let longitude = if distance_from_axis == 0.0 {
        0.0
    } else {
        y.atan2(x)
    };

    if distance_from_axis < 1e-9 {
        if z.abs() < 1e-9 {
            return Err(GeoConvertError::new(
                GeoConvertErrorCode::InvalidEcefOrigin,
                "position",
                "the ECEF origin has no geodetic coordinate",
            ));
        }
        return Ok(GeodeticInverseResult {
            position: LatLonHeight {
                latitude: if z < 0.0 { -90.0 } else { 90.0 },
                longitude: 0.0,
                ellipsoidal_height: z.abs() - semi_minor,
            },
            algorithm: "bowring-iterative",
            iterations: 0,
            tolerance_radians: options.tolerance_radians,
        });
    }

    let mut latitude = z.atan2(distance_from_axis * (1.0 - eccentricity_squared));
    let mut iterations = 0;
    let mut converged = false;
    while iterations < options.max_iterations {
        let sin_latitude = latitude.sin();
        let radius = options.ellipsoid.semi_major_axis_m
            / (1.0 - eccentricity_squared * sin_latitude * sin_latitude).sqrt();
        let next = (z + eccentricity_squared * radius * sin_latitude).atan2(distance_from_axis);
        iterations += 1;
        if (next - latitude).abs() <= options.tolerance_radians {
            latitude = next;
            converged = true;
            break;
        }
        latitude = next;
    }
    if !converged {
        return Err(GeoConvertError::new(
            GeoConvertErrorCode::NonConvergent,
            "position",
            format!(
                "ECEF inverse did not converge in {} iterations",
                options.max_iterations
            ),
        ));
    }

    let (sin_latitude, cos_latitude) = latitude.sin_cos();
    let radius = options.ellipsoid.semi_major_axis_m
        / (1.0 - eccentricity_squared * sin_latitude * sin_latitude).sqrt();
    let height = if cos_latitude.abs() > 1e-12 {
        distance_from_axis / cos_latitude - radius
    } else {
        z / sin_latitude - radius * (1.0 - eccentricity_squared)
    };
    Ok(GeodeticInverseResult {
        position: LatLonHeight {
            latitude: latitude.to_degrees(),
            longitude: longitude.to_degrees(),
            ellipsoidal_height: height,
        },
        algorithm: "bowring-iterative",
        iterations,
        tolerance_radians: options.tolerance_radians,
    })
}

#[derive(Debug, Clone, PartialEq)]
pub struct LocalFrame {
    id: Option<String>,
    origin: LatLonHeight,
    origin_ecef: Ecef,
    ellipsoid: Ellipsoid,
    ecef_to_enu_rotation: Matrix3,
}

impl LocalFrame {
    pub fn new(origin: LatLonHeight) -> Result<Self, GeoConvertError> {
        Self::with_ellipsoid(None, origin, WGS84_ELLIPSOID)
    }

    pub fn with_id(id: impl Into<String>, origin: LatLonHeight) -> Result<Self, GeoConvertError> {
        Self::with_ellipsoid(Some(id.into()), origin, WGS84_ELLIPSOID)
    }

    pub fn with_ellipsoid(
        id: Option<String>,
        origin: LatLonHeight,
        ellipsoid: Ellipsoid,
    ) -> Result<Self, GeoConvertError> {
        let [latitude, longitude, _] = geodetic_radians(origin)?;
        ellipsoid_terms(ellipsoid)?;
        Ok(Self {
            id,
            origin,
            origin_ecef: to_ecef_on(origin, ellipsoid)?,
            ellipsoid,
            ecef_to_enu_rotation: ecef_to_enu_rotation_radians(latitude, longitude),
        })
    }

    pub fn id(&self) -> Option<&str> {
        self.id.as_deref()
    }

    pub fn origin(&self) -> LatLonHeight {
        self.origin
    }

    pub fn origin_ecef(&self) -> Ecef {
        self.origin_ecef
    }

    pub fn ellipsoid(&self) -> Ellipsoid {
        self.ellipsoid
    }

    pub fn ecef_to_enu_rotation(&self) -> Matrix3 {
        self.ecef_to_enu_rotation
    }

    pub fn to_ecef(&self, position: Enu) -> Result<Ecef, GeoConvertError> {
        let displacement = multiply_matrix_vector(
            transpose_matrix3(self.ecef_to_enu_rotation),
            enu_values(position)?,
        );
        Ok(Ecef {
            x: self.origin_ecef.x + displacement[0],
            y: self.origin_ecef.y + displacement[1],
            z: self.origin_ecef.z + displacement[2],
        })
    }

    pub fn from_ecef(&self, position: Ecef) -> Result<Enu, GeoConvertError> {
        let ecef = ecef_values(position)?;
        let local = multiply_matrix_vector(
            self.ecef_to_enu_rotation,
            [
                ecef[0] - self.origin_ecef.x,
                ecef[1] - self.origin_ecef.y,
                ecef[2] - self.origin_ecef.z,
            ],
        );
        Ok(Enu {
            east: local[0],
            north: local[1],
            up: local[2],
        })
    }

    pub fn to_geodetic(&self, position: Enu) -> Result<LatLonHeight, GeoConvertError> {
        Ok(from_ecef_detailed(
            self.to_ecef(position)?,
            EcefInverseOptions {
                ellipsoid: self.ellipsoid,
                ..EcefInverseOptions::default()
            },
        )?
        .position)
    }

    pub fn from_geodetic(&self, position: LatLonHeight) -> Result<Enu, GeoConvertError> {
        self.from_ecef(to_ecef_on(position, self.ellipsoid)?)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GeoPoint {
    position: LatLonHeight,
}

impl GeoPoint {
    pub fn from_position(position: LatLonHeight) -> Result<Self, GeoConvertError> {
        to_ecef(position)?;
        Ok(Self { position })
    }

    pub fn from_lat_lon_height(
        latitude: f64,
        longitude: f64,
        ellipsoidal_height: f64,
    ) -> Result<Self, GeoConvertError> {
        Self::from_position(LatLonHeight {
            latitude,
            longitude,
            ellipsoidal_height,
        })
    }

    pub fn from_ecef(position: Ecef) -> Result<Self, GeoConvertError> {
        Self::from_position(from_ecef(position)?)
    }

    pub fn from_local_enu(position: Enu, frame: &LocalFrame) -> Result<Self, GeoConvertError> {
        Self::from_position(frame.to_geodetic(position)?)
    }

    pub fn position(&self) -> LatLonHeight {
        self.position
    }

    pub fn to_ecef(&self) -> Result<Ecef, GeoConvertError> {
        to_ecef(self.position)
    }

    pub fn to_local_enu(&self, frame: &LocalFrame) -> Result<Enu, GeoConvertError> {
        frame.from_geodetic(self.position)
    }

    pub fn local_frame(&self, id: impl Into<String>) -> Result<LocalFrame, GeoConvertError> {
        LocalFrame::with_id(id, self.position)
    }

    pub fn translate_enu(&self, offset: Enu) -> Result<Self, GeoConvertError> {
        Self::from_local_enu(offset, &LocalFrame::new(self.position)?)
    }
}
