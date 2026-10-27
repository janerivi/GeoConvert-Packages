import { GeoConvertInputError } from "./errors.js";
import type {
  EcefInverseOptions,
  EcefPosition,
  Ellipsoid,
  GeodeticInverseResult,
  GeodeticPosition,
  GeodeticRadiansInverseResult,
  GeodeticRadiansPosition,
  LocalEnuPosition,
  LocalFrame,
  LocalFrameOptions,
  Matrix3,
} from "./types.js";

type Vector3 = readonly [number, number, number];
const DEFAULT_TOLERANCE_RADIANS = 1e-13;
const DEFAULT_MAX_ITERATIONS = 16;

export const WGS84_ELLIPSOID: Ellipsoid = Object.freeze({
  id: "EPSG:7030",
  semiMajorAxisM: 6_378_137,
  inverseFlattening: 298.257223563,
});

function finite(field: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new GeoConvertInputError(
      "not-finite",
      field,
      "must be a finite number",
    );
  }
  return value;
}

function ellipsoidTerms(ellipsoid: Ellipsoid): {
  readonly semiMinorAxisM: number;
  readonly eccentricitySquared: number;
} {
  const semiMajorAxisM = finite(
    "ellipsoid.semiMajorAxisM",
    ellipsoid.semiMajorAxisM,
  );
  const inverseFlattening = finite(
    "ellipsoid.inverseFlattening",
    ellipsoid.inverseFlattening,
  );
  if (semiMajorAxisM <= 0) {
    throw new GeoConvertInputError(
      "out-of-range",
      "ellipsoid.semiMajorAxisM",
      "must be positive",
    );
  }
  if (inverseFlattening <= 1) {
    throw new GeoConvertInputError(
      "out-of-range",
      "ellipsoid.inverseFlattening",
      "must be greater than one",
    );
  }
  const flattening = 1 / inverseFlattening;
  return {
    semiMinorAxisM: semiMajorAxisM * (1 - flattening),
    eccentricitySquared: flattening * (2 - flattening),
  };
}

function geodeticRadians(position: GeodeticPosition): Vector3 {
  const latitude = finite("latitude", position.latitude);
  const longitude = finite("longitude", position.longitude);
  const height = finite("ellipsoidalHeight", position.ellipsoidalHeight);
  if (latitude < -90 || latitude > 90) {
    throw new GeoConvertInputError(
      "out-of-range",
      "latitude",
      "must be between -90 and 90",
    );
  }
  if (longitude < -180 || longitude > 180) {
    throw new GeoConvertInputError(
      "out-of-range",
      "longitude",
      "must be between -180 and 180",
    );
  }
  return [(latitude * Math.PI) / 180, (longitude * Math.PI) / 180, height];
}

function validatedRadianVector(position: GeodeticRadiansPosition): Vector3 {
  const latitude = finite("latitudeRadians", position.latitudeRadians);
  const longitude = finite("longitudeRadians", position.longitudeRadians);
  const height = finite("ellipsoidalHeight", position.ellipsoidalHeight);
  if (latitude < -Math.PI / 2 || latitude > Math.PI / 2) {
    throw new GeoConvertInputError(
      "out-of-range",
      "latitudeRadians",
      "must be between -pi/2 and pi/2",
    );
  }
  if (longitude < -Math.PI || longitude > Math.PI) {
    throw new GeoConvertInputError(
      "out-of-range",
      "longitudeRadians",
      "must be between -pi and pi",
    );
  }
  return [latitude, longitude, height];
}

function ecefVector(position: EcefPosition): Vector3 {
  return [
    finite("x", position.x),
    finite("y", position.y),
    finite("z", position.z),
  ];
}

function localVector(position: LocalEnuPosition): Vector3 {
  return [
    finite("east", position.east),
    finite("north", position.north),
    finite("up", position.up),
  ];
}

function ecefObject([x, y, z]: Vector3): EcefPosition {
  return Object.freeze({ x, y, z });
}

function localObject([east, north, up]: Vector3): LocalEnuPosition {
  return Object.freeze({ east, north, up });
}

function multiply(matrix: Matrix3, vector: Vector3): Vector3 {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

export function transposeMatrix3(matrix: Matrix3): Matrix3 {
  return [
    matrix[0],
    matrix[3],
    matrix[6],
    matrix[1],
    matrix[4],
    matrix[7],
    matrix[2],
    matrix[5],
    matrix[8],
  ];
}

function ecefToEnuRotationFromRadians(
  latitudeRadians: number,
  longitudeRadians: number,
): Matrix3 {
  const sinLatitude = Math.sin(latitudeRadians);
  const cosLatitude = Math.cos(latitudeRadians);
  const sinLongitude = Math.sin(longitudeRadians);
  const cosLongitude = Math.cos(longitudeRadians);
  return [
    -sinLongitude,
    cosLongitude,
    0,
    -sinLatitude * cosLongitude,
    -sinLatitude * sinLongitude,
    cosLatitude,
    cosLatitude * cosLongitude,
    cosLatitude * sinLongitude,
    sinLatitude,
  ];
}

/** Advanced form for canonical inputs already represented in radians. */
export function ecefToEnuRotationRadians(
  latitudeRadians: number,
  longitudeRadians: number,
): Matrix3 {
  const [latitude, longitude] = validatedRadianVector({
    latitudeRadians,
    longitudeRadians,
    ellipsoidalHeight: 0,
  });
  return ecefToEnuRotationFromRadians(latitude, longitude);
}

/** Rows map an ECEF displacement to local east, north and ellipsoid-up. */
export function ecefToEnuRotation(
  latitudeDegrees: number,
  longitudeDegrees: number,
): Matrix3 {
  const [latitude, longitude] = geodeticRadians({
    latitude: latitudeDegrees,
    longitude: longitudeDegrees,
    ellipsoidalHeight: 0,
  });
  return ecefToEnuRotationFromRadians(latitude, longitude);
}

function toEcefFromRadians(
  radians: Vector3,
  ellipsoid: Ellipsoid = WGS84_ELLIPSOID,
): EcefPosition {
  const [latitude, longitude, height] = radians;
  const { eccentricitySquared } = ellipsoidTerms(ellipsoid);
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const primeVerticalRadius =
    ellipsoid.semiMajorAxisM /
    Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);

  return ecefObject([
    (primeVerticalRadius + height) * cosLatitude * Math.cos(longitude),
    (primeVerticalRadius + height) * cosLatitude * Math.sin(longitude),
    (primeVerticalRadius * (1 - eccentricitySquared) + height) * sinLatitude,
  ]);
}

/** Convert geodetic degrees and ellipsoidal-height metres to ECEF metres. */
export function toEcef(
  position: GeodeticPosition,
  ellipsoid: Ellipsoid = WGS84_ELLIPSOID,
): EcefPosition {
  return toEcefFromRadians(geodeticRadians(position), ellipsoid);
}

/** Advanced ECEF conversion that does not round-trip canonical radians through degrees. */
export function toEcefRadians(
  position: GeodeticRadiansPosition,
  ellipsoid: Ellipsoid = WGS84_ELLIPSOID,
): EcefPosition {
  return toEcefFromRadians(validatedRadianVector(position), ellipsoid);
}

/** Convert ECEF metres and retain inverse-algorithm audit details. */
export function fromEcefRadiansDetailed(
  position: EcefPosition,
  options: EcefInverseOptions = {},
): GeodeticRadiansInverseResult {
  const ellipsoid = options.ellipsoid ?? WGS84_ELLIPSOID;
  const toleranceRadians =
    options.toleranceRadians ?? DEFAULT_TOLERANCE_RADIANS;
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const { semiMinorAxisM, eccentricitySquared } = ellipsoidTerms(ellipsoid);
  if (!Number.isFinite(toleranceRadians) || toleranceRadians <= 0) {
    throw new GeoConvertInputError(
      "out-of-range",
      "toleranceRadians",
      "must be a finite positive number",
    );
  }
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1) {
    throw new GeoConvertInputError(
      "out-of-range",
      "maxIterations",
      "must be a positive safe integer",
    );
  }
  const [x, y, z] = ecefVector(position);
  const distanceFromAxis = Math.hypot(x, y);
  const longitude = distanceFromAxis === 0 ? 0 : Math.atan2(y, x);

  if (distanceFromAxis < 1e-9) {
    if (Math.abs(z) < 1e-9) {
      throw new GeoConvertInputError(
        "invalid-ecef-origin",
        "position",
        "the ECEF origin has no geodetic coordinate",
      );
    }
    return Object.freeze({
      latitudeRadians: z < 0 ? -Math.PI / 2 : Math.PI / 2,
      longitudeRadians: 0,
      ellipsoidalHeight: Math.abs(z) - semiMinorAxisM,
      algorithm: "bowring-iterative",
      iterations: 0,
      toleranceRadians,
    });
  }

  let latitude = Math.atan2(z, distanceFromAxis * (1 - eccentricitySquared));
  let iterations = 0;
  let converged = false;
  for (; iterations < maxIterations; iterations += 1) {
    const sinLatitude = Math.sin(latitude);
    const primeVerticalRadius =
      ellipsoid.semiMajorAxisM /
      Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);
    const nextLatitude = Math.atan2(
      z + eccentricitySquared * primeVerticalRadius * sinLatitude,
      distanceFromAxis,
    );
    if (Math.abs(nextLatitude - latitude) <= toleranceRadians) {
      latitude = nextLatitude;
      iterations += 1;
      converged = true;
      break;
    }
    latitude = nextLatitude;
  }
  if (!converged) {
    throw new GeoConvertInputError(
      "non-convergent",
      "position",
      `ECEF inverse did not converge in ${maxIterations} iterations`,
    );
  }

  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const primeVerticalRadius =
    ellipsoid.semiMajorAxisM /
    Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);
  const ellipsoidalHeight =
    Math.abs(cosLatitude) > 1e-12
      ? distanceFromAxis / cosLatitude - primeVerticalRadius
      : z / sinLatitude - primeVerticalRadius * (1 - eccentricitySquared);

  return Object.freeze({
    latitudeRadians: latitude,
    longitudeRadians: longitude,
    ellipsoidalHeight,
    algorithm: "bowring-iterative",
    iterations,
    toleranceRadians,
  });
}

/** Convert ECEF metres and retain inverse-algorithm audit details. */
export function fromEcefDetailed(
  position: EcefPosition,
  options: EcefInverseOptions = {},
): GeodeticInverseResult {
  const result = fromEcefRadiansDetailed(position, options);
  return Object.freeze({
    latitude: (result.latitudeRadians * 180) / Math.PI,
    longitude: (result.longitudeRadians * 180) / Math.PI,
    ellipsoidalHeight: result.ellipsoidalHeight,
    algorithm: result.algorithm,
    iterations: result.iterations,
    toleranceRadians: result.toleranceRadians,
  });
}

/** Advanced ECEF inverse for consumers whose canonical representation is radians. */
export function fromEcefRadians(
  position: EcefPosition,
  options: EcefInverseOptions = {},
): GeodeticRadiansPosition {
  const result = fromEcefRadiansDetailed(position, options);
  return Object.freeze({
    latitudeRadians: result.latitudeRadians,
    longitudeRadians: result.longitudeRadians,
    ellipsoidalHeight: result.ellipsoidalHeight,
  });
}

/** Convert ECEF metres to geodetic degrees and ellipsoidal-height metres. */
export function fromEcef(
  position: EcefPosition,
  options: EcefInverseOptions = {},
): GeodeticPosition {
  const result = fromEcefDetailed(position, options);
  return Object.freeze({
    latitude: result.latitude,
    longitude: result.longitude,
    ellipsoidalHeight: result.ellipsoidalHeight,
  });
}

/** Create a reusable right-handed local east/north/ellipsoid-up frame. */
export function createLocalFrame(options: LocalFrameOptions): LocalFrame {
  const origin = Object.freeze({ ...options.origin });
  const ellipsoid = Object.freeze(options.ellipsoid ?? WGS84_ELLIPSOID);
  const [latitude, longitude] = geodeticRadians(origin);
  ellipsoidTerms(ellipsoid);
  const originEcef = toEcef(origin, ellipsoid);
  const originVector = ecefVector(originEcef);
  const rotation = ecefToEnuRotationFromRadians(latitude, longitude);
  const inverseRotation = transposeMatrix3(rotation);

  const toFrameEcef = (position: LocalEnuPosition): EcefPosition => {
    const displacement = multiply(inverseRotation, localVector(position));
    return ecefObject([
      originVector[0] + displacement[0],
      originVector[1] + displacement[1],
      originVector[2] + displacement[2],
    ]);
  };
  const fromFrameEcef = (position: EcefPosition): LocalEnuPosition => {
    const ecef = ecefVector(position);
    return localObject(
      multiply(rotation, [
        ecef[0] - originVector[0],
        ecef[1] - originVector[1],
        ecef[2] - originVector[2],
      ]),
    );
  };

  return Object.freeze({
    id: options.id,
    origin,
    originEcef,
    ellipsoid,
    ecefToEnuRotation: rotation,
    toEcef: toFrameEcef,
    fromEcef: fromFrameEcef,
    toGeodetic: (position: LocalEnuPosition) =>
      fromEcef(toFrameEcef(position), { ellipsoid }),
    fromGeodetic: (position: GeodeticPosition) =>
      fromFrameEcef(toEcef(position, ellipsoid)),
  });
}
