import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GeoConvertInputError,
  GeoPoint,
  WGS84_ELLIPSOID,
  createLocalFrame,
  ecefToEnuRotationRadians,
  fromEcef,
  fromEcefDetailed,
  fromEcefRadiansDetailed,
  toEcef,
  toEcefRadians,
} from "../dist/index.js";

const origin = {
  latitude: 40.71280972815316,
  longitude: -74.00600677999316,
  ellipsoidalHeight: 8.758042892441154,
};

const frame = createLocalFrame({ id: "frame-nyc-o1-v1", origin });

function close(actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );
}

describe("friendly geodesy API", () => {
  it("uses degree and named-object inputs for the Manhattan origin", () => {
    close(frame.originEcef.x, 1333999.5404150502, 2e-6);
    close(frame.originEcef.y, -4654050.704747981, 2e-6);
    close(frame.originEcef.z, 4138306.7701370167, 2e-6);
    assert.deepEqual(frame.fromEcef(frame.originEcef), {
      east: 0,
      north: 0,
      up: 0,
    });
  });

  it("round-trips the Midtown control through local ENU and ECEF", () => {
    const midtown = {
      east: 1731.070133330654,
      north: 5019.627124527663,
      up: 12.786684010304,
    };
    const ecef = frame.toEcef(midtown);
    close(ecef.x, 1334764.1266239272, 2e-6);
    close(ecef.y, -4650435.647116686, 2e-6);
    close(ecef.z, 4142119.930247306, 2e-6);
    const roundTrip = frame.fromEcef(ecef);
    close(roundTrip.east, midtown.east, 1e-6);
    close(roundTrip.north, midtown.north, 1e-6);
    close(roundTrip.up, midtown.up, 1e-6);
  });

  it("round-trips WGS 84 geodetic coordinates", () => {
    const ecef = toEcef(origin);
    const roundTrip = fromEcef(ecef);
    close(roundTrip.latitude, origin.latitude, 1e-11);
    close(roundTrip.longitude, origin.longitude, 1e-11);
    close(roundTrip.ellipsoidalHeight, origin.ellipsoidalHeight, 2e-6);
  });

  it("exposes inverse audit details and explicit ellipsoid parameters", () => {
    const ecef = toEcef(origin, WGS84_ELLIPSOID);
    const inverse = fromEcefDetailed(ecef, {
      ellipsoid: WGS84_ELLIPSOID,
      toleranceRadians: 1e-13,
      maxIterations: 16,
    });
    assert.equal(inverse.algorithm, "bowring-iterative");
    assert.ok(inverse.iterations > 0);
    assert.equal(inverse.toleranceRadians, 1e-13);
    close(inverse.latitude, origin.latitude, 1e-11);
  });

  it("preserves canonical radian inputs without a degrees round trip", () => {
    const source = {
      latitudeRadians: (40.77 * Math.PI) / 180,
      longitudeRadians: (-73.97 * Math.PI) / 180,
      ellipsoidalHeight: -12.5,
    };
    const ecef = toEcefRadians(source);
    const inverse = fromEcefRadiansDetailed(ecef);
    close(inverse.latitudeRadians, source.latitudeRadians, 2e-13);
    close(inverse.longitudeRadians, source.longitudeRadians, 2e-13);
    close(inverse.ellipsoidalHeight, source.ellipsoidalHeight, 2e-6);
    const rotation = ecefToEnuRotationRadians(
      source.latitudeRadians,
      source.longitudeRadians,
    );
    close(Math.hypot(rotation[6], rotation[7], rotation[8]), 1, 2e-15);
  });

  it("supports familiar static constructors and convenience methods", () => {
    const originPoint = GeoPoint.fromLatLonHeight(
      origin.latitude,
      origin.longitude,
      origin.ellipsoidalHeight,
    );
    const samePoint = GeoPoint.fromECEF(originPoint.toECEF());
    const sameFrame = originPoint.localFrame("frame-nyc-o1-v1");
    const local = samePoint.toLocalENU(sameFrame);
    close(local.east, 0, 1e-8);
    close(local.north, 0, 1e-8);
    close(local.up, 0, 1e-8);

    const shifted = originPoint.translateENU({ east: 10, north: 20, up: 3 });
    const shiftedLocal = shifted.toLocalENU(sameFrame);
    close(shiftedLocal.east, 10, 1e-8);
    close(shiftedLocal.north, 20, 1e-8);
    close(shiftedLocal.up, 3, 1e-8);
  });

  it("reports the invalid field without hiding it in a generic error", () => {
    assert.throws(
      () => toEcef({ latitude: 91, longitude: 0, ellipsoidalHeight: 0 }),
      (error) =>
        error instanceof GeoConvertInputError &&
        error.field === "latitude" &&
        error.code === "out-of-range",
    );
  });
});
