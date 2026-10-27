import {
  GeoPoint,
  createLocalFrame,
  geoPoseBasicQuaternionToLocalPose,
  localPoseToGeoPoseBasicQuaternion,
  type BasicQuaternionGeoPose,
  type ConversionRequest,
  type ECEF,
  type ENU,
  type EcefPosition,
  type GeodeticPosition,
  type LatLonHeight,
  type LocalEnuPosition,
  type LocalCameraPose,
} from "../src/index.js";
import { createCliClient } from "../src/node.js";

const origin = {
  latitude: 40.71280972815316,
  longitude: -74.00600677999316,
  ellipsoidalHeight: 8.758042892441154,
} satisfies GeodeticPosition;
const frame = createLocalFrame({ id: "frame-nyc-o1-v1", origin });
const local: LocalEnuPosition = frame.fromGeodetic(origin);
const ecef: EcefPosition = frame.toEcef(local);
const point: GeoPoint = GeoPoint.fromLocalENU(local, frame);
const familiarLlh: LatLonHeight = origin;
const familiarEcef: ECEF = ecef;
const familiarEnu: ENU = local;
void ecef;
void point;
void familiarLlh;
void familiarEcef;
void familiarEnu;

const localPose: LocalCameraPose = {
  position: local,
  orientationXyzw: [0, 0, 0, 1],
};
const geopose: BasicQuaternionGeoPose = localPoseToGeoPoseBasicQuaternion(
  localPose,
  frame,
);
geoPoseBasicQuaternionToLocalPose(geopose, frame) satisfies LocalCameraPose;

declare const request: ConversionRequest;
const client = createCliClient();
client.convert(request).then(({ result, receipt }) => {
  result.coordinates satisfies unknown[];
  receipt.result_hash satisfies string;
});
