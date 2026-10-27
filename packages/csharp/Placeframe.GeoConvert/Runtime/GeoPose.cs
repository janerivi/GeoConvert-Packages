using System;

namespace Placeframe.GeoConvert
{
    public readonly struct QuaternionXyzw
    {
        public QuaternionXyzw(double x, double y, double z, double w)
        {
            X = x;
            Y = y;
            Z = z;
            W = w;
        }

        public double X { get; }
        public double Y { get; }
        public double Z { get; }
        public double W { get; }
    }

    public readonly struct LocalCameraPose
    {
        public LocalCameraPose(ENU position, QuaternionXyzw orientation)
        {
            Position = position;
            OrientationXyzw = orientation;
        }

        public ENU Position { get; }
        public QuaternionXyzw OrientationXyzw { get; }
    }

    public readonly struct GeoPosePosition
    {
        public GeoPosePosition(double lat, double lon, double h)
        {
            Lat = lat;
            Lon = lon;
            H = h;
        }

        public double Lat { get; }
        public double Lon { get; }
        public double H { get; }
    }

    public readonly struct GeoPoseQuaternion
    {
        public GeoPoseQuaternion(double x, double y, double z, double w)
        {
            X = x;
            Y = y;
            Z = z;
            W = w;
        }

        public double X { get; }
        public double Y { get; }
        public double Z { get; }
        public double W { get; }
    }

    public readonly struct BasicQuaternionGeoPose
    {
        public BasicQuaternionGeoPose(
            GeoPosePosition position,
            GeoPoseQuaternion quaternion)
        {
            Position = position;
            Quaternion = quaternion;
        }

        public GeoPosePosition Position { get; }
        public GeoPoseQuaternion Quaternion { get; }
    }

    public static class GeoPoseMath
    {
        public const string StandardIdentifier = "OGC 21-056r11";
        public const string BasicQuaternionProfile =
            "/conf/basic-quaternion-encoding-json-strict";
        public const string StrictSchemaUri =
            "https://schemas.opengis.net/geopose/1.0/schemata/GeoPose.Basic.Strict_Quaternion.Schema.json";

        private const double UnitQuaternionNormTolerance = 1e-12;

        private static QuaternionXyzw CanonicalizeSign(QuaternionXyzw quaternion)
        {
            GeoConvertMath.Finite("orientation.x", quaternion.X);
            GeoConvertMath.Finite("orientation.y", quaternion.Y);
            GeoConvertMath.Finite("orientation.z", quaternion.Z);
            GeoConvertMath.Finite("orientation.w", quaternion.W);
            double halfTurn = quaternion.W == 0.0
                ? FirstNonZero(quaternion.X, quaternion.Y, quaternion.Z)
                : 1.0;
            double sign = quaternion.W < 0.0
                || (quaternion.W == 0.0 && halfTurn < 0.0)
                ? -1.0
                : 1.0;
            return new QuaternionXyzw(
                PositiveZero(sign * quaternion.X),
                PositiveZero(sign * quaternion.Y),
                PositiveZero(sign * quaternion.Z),
                PositiveZero(sign * quaternion.W));
        }

        private static double FirstNonZero(double x, double y, double z)
        {
            if (x != 0.0) return x;
            if (y != 0.0) return y;
            if (z != 0.0) return z;
            return 1.0;
        }

        private static double PositiveZero(double value)
        {
            return value == 0.0 ? 0.0 : value;
        }

        private static QuaternionXyzw Normalize(QuaternionXyzw quaternion)
        {
            double norm = Math.Sqrt(
                quaternion.X * quaternion.X
                + quaternion.Y * quaternion.Y
                + quaternion.Z * quaternion.Z
                + quaternion.W * quaternion.W);
            if (double.IsNaN(norm) || double.IsInfinity(norm) || norm <= 1e-15)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.OutOfRange,
                    "orientationXyzw",
                    "quaternion must be finite and non-zero");
            }

            return CanonicalizeSign(
                new QuaternionXyzw(
                    quaternion.X / norm,
                    quaternion.Y / norm,
                    quaternion.Z / norm,
                    quaternion.W / norm));
        }

        private static QuaternionXyzw CanonicalizeUnit(QuaternionXyzw quaternion)
        {
            GeoConvertMath.Finite("orientation.x", quaternion.X);
            GeoConvertMath.Finite("orientation.y", quaternion.Y);
            GeoConvertMath.Finite("orientation.z", quaternion.Z);
            GeoConvertMath.Finite("orientation.w", quaternion.W);
            double norm = Math.Sqrt(
                quaternion.X * quaternion.X
                + quaternion.Y * quaternion.Y
                + quaternion.Z * quaternion.Z
                + quaternion.W * quaternion.W);
            if (Math.Abs(norm - 1.0) > UnitQuaternionNormTolerance)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.OutOfRange,
                    "orientationXyzw",
                    "quaternion norm "
                        + norm
                        + " exceeds the canonical tolerance "
                        + UnitQuaternionNormTolerance);
            }

            return CanonicalizeSign(quaternion);
        }

        private static double[] MultiplyMatrix(double[] left, double[] right)
        {
            return new[]
            {
                left[0] * right[0] + left[1] * right[3] + left[2] * right[6],
                left[0] * right[1] + left[1] * right[4] + left[2] * right[7],
                left[0] * right[2] + left[1] * right[5] + left[2] * right[8],
                left[3] * right[0] + left[4] * right[3] + left[5] * right[6],
                left[3] * right[1] + left[4] * right[4] + left[5] * right[7],
                left[3] * right[2] + left[4] * right[5] + left[5] * right[8],
                left[6] * right[0] + left[7] * right[3] + left[8] * right[6],
                left[6] * right[1] + left[7] * right[4] + left[8] * right[7],
                left[6] * right[2] + left[7] * right[5] + left[8] * right[8]
            };
        }

        private static double[] QuaternionToMatrix(QuaternionXyzw quaternion)
        {
            QuaternionXyzw q = Normalize(quaternion);
            return new[]
            {
                1.0 - 2.0 * (q.Y * q.Y + q.Z * q.Z),
                2.0 * (q.X * q.Y - q.Z * q.W),
                2.0 * (q.X * q.Z + q.Y * q.W),
                2.0 * (q.X * q.Y + q.Z * q.W),
                1.0 - 2.0 * (q.X * q.X + q.Z * q.Z),
                2.0 * (q.Y * q.Z - q.X * q.W),
                2.0 * (q.X * q.Z - q.Y * q.W),
                2.0 * (q.Y * q.Z + q.X * q.W),
                1.0 - 2.0 * (q.X * q.X + q.Y * q.Y)
            };
        }

        private static QuaternionXyzw MatrixToQuaternion(double[] matrix)
        {
            double trace = matrix[0] + matrix[4] + matrix[8];
            double x;
            double y;
            double z;
            double w;
            if (trace > 0.0)
            {
                double scale = Math.Sqrt(trace + 1.0) * 2.0;
                w = scale / 4.0;
                x = (matrix[7] - matrix[5]) / scale;
                y = (matrix[2] - matrix[6]) / scale;
                z = (matrix[3] - matrix[1]) / scale;
            }
            else if (matrix[0] > matrix[4] && matrix[0] > matrix[8])
            {
                double scale = Math.Sqrt(1.0 + matrix[0] - matrix[4] - matrix[8]) * 2.0;
                w = (matrix[7] - matrix[5]) / scale;
                x = scale / 4.0;
                y = (matrix[1] + matrix[3]) / scale;
                z = (matrix[2] + matrix[6]) / scale;
            }
            else if (matrix[4] > matrix[8])
            {
                double scale = Math.Sqrt(1.0 + matrix[4] - matrix[0] - matrix[8]) * 2.0;
                w = (matrix[2] - matrix[6]) / scale;
                x = (matrix[1] + matrix[3]) / scale;
                y = scale / 4.0;
                z = (matrix[5] + matrix[7]) / scale;
            }
            else
            {
                double scale = Math.Sqrt(1.0 + matrix[8] - matrix[0] - matrix[4]) * 2.0;
                w = (matrix[3] - matrix[1]) / scale;
                x = (matrix[2] + matrix[6]) / scale;
                y = (matrix[5] + matrix[7]) / scale;
                z = scale / 4.0;
            }

            return Normalize(new QuaternionXyzw(x, y, z, w));
        }

        public static BasicQuaternionGeoPose LocalPoseToGeoPoseBasicQuaternion(
            LocalCameraPose pose,
            LocalFrame projectFrame)
        {
            QuaternionXyzw orientation = CanonicalizeUnit(pose.OrientationXyzw);
            LatLonHeight geodetic = GeoConvertMath.FromECEFDetailed(
                projectFrame.ToECEF(pose.Position),
                new EcefInverseOptions { Ellipsoid = projectFrame.Ellipsoid }).Position;
            LocalFrame poseFrame = LocalFrame.Create(
                null,
                geodetic,
                projectFrame.Ellipsoid);
            double[] rotationPoseEnuCamera = MultiplyMatrix(
                MultiplyMatrix(
                    poseFrame.Rotation,
                    GeoConvertMath.Transpose(projectFrame.Rotation)),
                QuaternionToMatrix(orientation));
            QuaternionXyzw result = MatrixToQuaternion(
                GeoConvertMath.Transpose(rotationPoseEnuCamera));
            return new BasicQuaternionGeoPose(
                new GeoPosePosition(
                    geodetic.Latitude,
                    geodetic.Longitude,
                    geodetic.EllipsoidalHeight),
                new GeoPoseQuaternion(result.X, result.Y, result.Z, result.W));
        }

        public static LocalCameraPose GeoPoseBasicQuaternionToLocalPose(
            BasicQuaternionGeoPose geoPose,
            LocalFrame projectFrame)
        {
            LocalFrame poseFrame = LocalFrame.Create(
                null,
                new LatLonHeight(
                    geoPose.Position.Lat,
                    geoPose.Position.Lon,
                    geoPose.Position.H),
                projectFrame.Ellipsoid);
            QuaternionXyzw cameraPoseEnu = CanonicalizeUnit(
                new QuaternionXyzw(
                    geoPose.Quaternion.X,
                    geoPose.Quaternion.Y,
                    geoPose.Quaternion.Z,
                    geoPose.Quaternion.W));
            double[] rotationPoseEnuCamera = GeoConvertMath.Transpose(
                QuaternionToMatrix(cameraPoseEnu));
            double[] rotationProjectEnuCamera = MultiplyMatrix(
                MultiplyMatrix(
                    projectFrame.Rotation,
                    GeoConvertMath.Transpose(poseFrame.Rotation)),
                rotationPoseEnuCamera);
            return new LocalCameraPose(
                projectFrame.FromECEF(poseFrame.OriginECEF),
                MatrixToQuaternion(rotationProjectEnuCamera));
        }
    }
}
