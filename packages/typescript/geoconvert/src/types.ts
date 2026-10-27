/** Geographic position on the WGS 84 ellipsoid. Latitude and longitude are degrees. */
export interface GeodeticPosition {
  readonly latitude: number;
  readonly longitude: number;
  readonly ellipsoidalHeight: number;
}

/** Earth-centred, Earth-fixed Cartesian position in metres. */
export interface EcefPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Right-handed local east, north, ellipsoid-up position in metres. */
export interface LocalEnuPosition {
  readonly east: number;
  readonly north: number;
  readonly up: number;
}

/** Reference ellipsoid parameters for advanced and compatibility consumers. */
export interface Ellipsoid {
  readonly id: string;
  readonly semiMajorAxisM: number;
  readonly inverseFlattening: number;
}

export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface EcefInverseOptions {
  readonly ellipsoid?: Ellipsoid;
  readonly toleranceRadians?: number;
  readonly maxIterations?: number;
}

export interface GeodeticInverseResult extends GeodeticPosition {
  readonly algorithm: "bowring-iterative";
  readonly iterations: number;
  readonly toleranceRadians: number;
}

/** Familiar short name for a latitude/longitude/ellipsoidal-height object. */
export type LatLonHeight = GeodeticPosition;

/** Familiar short name for an Earth-centred, Earth-fixed position. */
export type ECEF = EcefPosition;

/** Familiar short name for a local east/north/up position. */
export type ENU = LocalEnuPosition;

export interface LocalFrameOptions {
  /** Stable application identity such as `frame-nyc-o1-v1`. */
  readonly id?: string;
  readonly origin: GeodeticPosition;
  readonly ellipsoid?: Ellipsoid;
}

export interface LocalFrame {
  readonly id: string | undefined;
  readonly origin: GeodeticPosition;
  readonly originEcef: EcefPosition;
  readonly ellipsoid: Ellipsoid;
  /** Rows map an ECEF displacement to east, north and ellipsoid-up. */
  readonly ecefToEnuRotation: Matrix3;

  /** Convert a local east/north/up position to ECEF metres. */
  toEcef(position: LocalEnuPosition): EcefPosition;

  /** Convert ECEF metres to this frame's local east/north/up position. */
  fromEcef(position: EcefPosition): LocalEnuPosition;

  /** Convert a local east/north/up position to latitude/longitude/ellipsoidal height. */
  toGeodetic(position: LocalEnuPosition): GeodeticPosition;

  /** Convert latitude/longitude/ellipsoidal height to this frame's local axes. */
  fromGeodetic(position: GeodeticPosition): LocalEnuPosition;
}
