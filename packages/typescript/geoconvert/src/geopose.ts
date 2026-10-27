import {
  createLocalFrame,
  createLocalFrameRadians,
  fromEcefRadians,
  transposeMatrix3,
} from "./geodesy.js";
import type {
  GeodeticPosition,
  LocalEnuPosition,
  LocalFrame,
  Matrix3,
} from "./types.js";

export const OGC_GEOPOSE_STANDARD_IDENTIFIER = "OGC 21-056r11" as const;
export const OGC_GEOPOSE_BASIC_QUATERNION_PROFILE =
  "/conf/basic-quaternion-encoding-json-strict" as const;
export const OGC_GEOPOSE_STRICT_SCHEMA_URI =
  "https://schemas.opengis.net/geopose/1.0/schemata/GeoPose.Basic.Strict_Quaternion.Schema.json" as const;

export type QuaternionXyzw = readonly [number, number, number, number];

export interface LocalCameraPose {
  readonly position: LocalEnuPosition;
  /** Camera-local direction coordinates to the supplied local ENU frame. */
  readonly orientationXyzw: QuaternionXyzw;
}

export interface BasicQuaternionGeoPose {
  readonly position: {
    readonly lat: number;
    readonly lon: number;
    readonly h: number;
  };
  /** Pose-local ENU coordinates to camera coordinates, Hamilton xyzw. */
  readonly quaternion: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly w: number;
  };
}

const UNIT_QUATERNION_NORM_TOLERANCE = 1e-12;

function positiveZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function canonicalizeQuaternionSign(
  quaternion: QuaternionXyzw,
): QuaternionXyzw {
  if (quaternion.some((component) => !Number.isFinite(component))) {
    throw new RangeError("Quaternion components must be finite");
  }
  const [x, y, z, w] = quaternion;
  const halfTurnTieBreak =
    w === 0 ? ([x, y, z].find((value) => value !== 0) ?? 1) : 1;
  const sign = w < 0 || (w === 0 && halfTurnTieBreak < 0) ? -1 : 1;
  return [
    positiveZero(sign * x),
    positiveZero(sign * y),
    positiveZero(sign * z),
    positiveZero(sign * w),
  ];
}

function normalizeQuaternion(quaternion: QuaternionXyzw): QuaternionXyzw {
  const norm = Math.hypot(...quaternion);
  if (!Number.isFinite(norm) || norm <= 1e-15) {
    throw new RangeError("Quaternion must be finite and non-zero");
  }
  return canonicalizeQuaternionSign([
    quaternion[0] / norm,
    quaternion[1] / norm,
    quaternion[2] / norm,
    quaternion[3] / norm,
  ]);
}

function canonicalizeUnitQuaternion(
  quaternion: QuaternionXyzw,
): QuaternionXyzw {
  if (quaternion.some((component) => !Number.isFinite(component))) {
    throw new RangeError("Quaternion components must be finite");
  }
  const norm = Math.hypot(...quaternion);
  if (Math.abs(norm - 1) > UNIT_QUATERNION_NORM_TOLERANCE) {
    throw new RangeError(
      `Quaternion norm ${norm} exceeds the canonical tolerance ${UNIT_QUATERNION_NORM_TOLERANCE}`,
    );
  }
  if (norm === 0) throw new RangeError("Quaternion must be non-zero");
  return canonicalizeQuaternionSign(quaternion);
}

function multiplyMatrix3(left: Matrix3, right: Matrix3): Matrix3 {
  return [
    left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
    left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
    left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
    left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
    left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
    left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
    left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
    left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
    left[6] * right[2] + left[7] * right[5] + left[8] * right[8],
  ];
}

function quaternionToRotationMatrix(quaternion: QuaternionXyzw): Matrix3 {
  const [x, y, z, w] = normalizeQuaternion(quaternion);
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - z * w),
    2 * (x * z + y * w),
    2 * (x * y + z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z - x * w),
    2 * (x * z - y * w),
    2 * (y * z + x * w),
    1 - 2 * (x * x + y * y),
  ];
}

function rotationMatrixToQuaternion(matrix: Matrix3): QuaternionXyzw {
  const trace = matrix[0] + matrix[4] + matrix[8];
  let x: number;
  let y: number;
  let z: number;
  let w: number;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    w = scale / 4;
    x = (matrix[7] - matrix[5]) / scale;
    y = (matrix[2] - matrix[6]) / scale;
    z = (matrix[3] - matrix[1]) / scale;
  } else if (matrix[0] > matrix[4] && matrix[0] > matrix[8]) {
    const scale = Math.sqrt(1 + matrix[0] - matrix[4] - matrix[8]) * 2;
    w = (matrix[7] - matrix[5]) / scale;
    x = scale / 4;
    y = (matrix[1] + matrix[3]) / scale;
    z = (matrix[2] + matrix[6]) / scale;
  } else if (matrix[4] > matrix[8]) {
    const scale = Math.sqrt(1 + matrix[4] - matrix[0] - matrix[8]) * 2;
    w = (matrix[2] - matrix[6]) / scale;
    x = (matrix[1] + matrix[3]) / scale;
    y = scale / 4;
    z = (matrix[5] + matrix[7]) / scale;
  } else {
    const scale = Math.sqrt(1 + matrix[8] - matrix[0] - matrix[4]) * 2;
    w = (matrix[3] - matrix[1]) / scale;
    x = (matrix[2] + matrix[6]) / scale;
    y = (matrix[5] + matrix[7]) / scale;
    z = scale / 4;
  }
  return normalizeQuaternion([x, y, z, w]);
}

function poseFrame(
  position: BasicQuaternionGeoPose["position"],
  projectFrame: LocalFrame,
): LocalFrame {
  const geodetic: GeodeticPosition = {
    latitude: position.lat,
    longitude: position.lon,
    ellipsoidalHeight: position.h,
  };
  return createLocalFrame({
    origin: geodetic,
    ellipsoid: projectFrame.ellipsoid,
  });
}

/** Convert a camera pose in one local ENU frame to OGC Basic-Quaternion. */
export function localPoseToGeoPoseBasicQuaternion(
  pose: LocalCameraPose,
  projectFrame: LocalFrame,
): BasicQuaternionGeoPose {
  const canonicalOrientation = canonicalizeUnitQuaternion(pose.orientationXyzw);
  const poseEcef = projectFrame.toEcef(pose.position);
  const geodeticRadians = fromEcefRadians(poseEcef, {
    ellipsoid: projectFrame.ellipsoid,
  });
  const geodetic = {
    latitude: (geodeticRadians.latitudeRadians * 180) / Math.PI,
    longitude: (geodeticRadians.longitudeRadians * 180) / Math.PI,
    ellipsoidalHeight: geodeticRadians.ellipsoidalHeight,
  };
  const localPoseFrame = createLocalFrameRadians({
    origin: geodeticRadians,
    ellipsoid: projectFrame.ellipsoid,
  });
  const rotationPoseEnuCamera = multiplyMatrix3(
    multiplyMatrix3(
      localPoseFrame.ecefToEnuRotation,
      transposeMatrix3(projectFrame.ecefToEnuRotation),
    ),
    quaternionToRotationMatrix(canonicalOrientation),
  );
  const [x, y, z, w] = rotationMatrixToQuaternion(
    transposeMatrix3(rotationPoseEnuCamera),
  );
  return Object.freeze({
    position: Object.freeze({
      lat: geodetic.latitude,
      lon: geodetic.longitude,
      h: geodetic.ellipsoidalHeight,
    }),
    quaternion: Object.freeze({ x, y, z, w }),
  });
}

/** Convert OGC Basic-Quaternion to a camera pose in one local ENU frame. */
export function geoPoseBasicQuaternionToLocalPose(
  geopose: BasicQuaternionGeoPose,
  projectFrame: LocalFrame,
): LocalCameraPose {
  const localPoseFrame = poseFrame(geopose.position, projectFrame);
  const qCameraPoseEnu = canonicalizeUnitQuaternion([
    geopose.quaternion.x,
    geopose.quaternion.y,
    geopose.quaternion.z,
    geopose.quaternion.w,
  ]);
  const rotationPoseEnuCamera = transposeMatrix3(
    quaternionToRotationMatrix(qCameraPoseEnu),
  );
  const rotationProjectEnuCamera = multiplyMatrix3(
    multiplyMatrix3(
      projectFrame.ecefToEnuRotation,
      transposeMatrix3(localPoseFrame.ecefToEnuRotation),
    ),
    rotationPoseEnuCamera,
  );
  return Object.freeze({
    position: projectFrame.fromEcef(localPoseFrame.originEcef),
    orientationXyzw: rotationMatrixToQuaternion(rotationProjectEnuCamera),
  });
}
