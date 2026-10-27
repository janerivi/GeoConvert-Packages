import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createLocalFrame,
  geoPoseBasicQuaternionToLocalPose,
  localPoseToGeoPoseBasicQuaternion,
} from "../dist/index.js";

const projectFrame = createLocalFrame({
  id: "frame-nyc-o1-v1",
  origin: {
    latitude: 40.71280972815316,
    longitude: -74.00600677999316,
    ellipsoidalHeight: 8.758042892441154,
  },
});

const controls = [
  {
    local: { east: 0, north: 0, up: 0 },
    position: {
      lat: 40.71280972815316,
      lon: -74.00600677999316,
      h: 8.758042892441154,
    },
    quaternion: [0, 0, 0, 1],
  },
  {
    local: { east: 12_000, north: 16_000, up: 250 },
    position: {
      lat: 40.856795345386736,
      lon: -73.86369308041378,
      h: 290.146458867006,
    },
    quaternion: [
      -0.0012565102484849817, 0.0009403432656816229, 0.0008112473730791283,
      0.9999984394059013,
    ],
  },
];

function close(actual, expected, tolerance) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} != ${expected}`,
  );
}

describe("generic OGC GeoPose adapter", () => {
  it("matches independent Manhattan pose-local ENU controls", () => {
    for (const control of controls) {
      const geopose = localPoseToGeoPoseBasicQuaternion(
        { position: control.local, orientationXyzw: [0, 0, 0, 1] },
        projectFrame,
      );
      close(geopose.position.lat, control.position.lat, 1e-11);
      close(geopose.position.lon, control.position.lon, 1e-11);
      close(geopose.position.h, control.position.h, 2e-6);
      for (const [index, value] of [
        geopose.quaternion.x,
        geopose.quaternion.y,
        geopose.quaternion.z,
        geopose.quaternion.w,
      ].entries()) {
        close(value, control.quaternion[index], 1e-12);
      }
    }
  });

  it("round-trips a project-frame camera pose", () => {
    const source = {
      position: { east: -6000, north: 8000, up: 100 },
      orientationXyzw: [0, 0, 0, 1],
    };
    const roundTrip = geoPoseBasicQuaternionToLocalPose(
      localPoseToGeoPoseBasicQuaternion(source, projectFrame),
      projectFrame,
    );
    close(roundTrip.position.east, source.position.east, 1e-8);
    close(roundTrip.position.north, source.position.north, 1e-8);
    close(roundTrip.position.up, source.position.up, 1e-8);
    for (const [index, value] of roundTrip.orientationXyzw.entries()) {
      close(value, source.orientationXyzw[index], 1e-12);
    }
  });

  it("rejects a materially non-unit quaternion", () => {
    assert.throws(
      () =>
        localPoseToGeoPoseBasicQuaternion(
          {
            position: { east: 0, north: 0, up: 0 },
            orientationXyzw: [0, 0, 0, 2],
          },
          projectFrame,
        ),
      /exceeds the canonical tolerance/,
    );
  });
});
