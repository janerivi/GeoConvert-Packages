import assert from "node:assert/strict";

import {
  GeoPoint,
  geoPoseBasicQuaternionToLocalPose,
  localPoseToGeoPoseBasicQuaternion,
} from "@placeframe/geoconvert";

const origin = GeoPoint.fromLatLonHeight(
  40.71280972815316,
  -74.00600677999316,
  8.758042892441154,
);
const manhattan = origin.localFrame("frame-nyc-o1-v1");
const midtownEnu = {
  east: 1731.070133330654,
  north: 5019.627124527663,
  up: 12.786684010304,
};

const midtown = GeoPoint.fromLocalENU(midtownEnu, manhattan);
const midtownEcef = midtown.toECEF();
const roundTrip = midtown.toLocalENU(manhattan);
const geopose = localPoseToGeoPoseBasicQuaternion(
  { position: midtownEnu, orientationXyzw: [0, 0, 0, 1] },
  manhattan,
);
const poseRoundTrip = geoPoseBasicQuaternionToLocalPose(geopose, manhattan);

for (const axis of ["east", "north", "up"]) {
  assert.ok(Math.abs(roundTrip[axis] - midtownEnu[axis]) <= 1e-6);
  assert.ok(Math.abs(poseRoundTrip.position[axis] - midtownEnu[axis]) <= 1e-8);
}

console.log({
  frame: manhattan.id,
  ecefMetres: midtownEcef,
  roundTripEnuMetres: roundTrip,
  geopose,
});
