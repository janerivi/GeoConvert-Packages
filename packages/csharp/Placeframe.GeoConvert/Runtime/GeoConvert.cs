using System;

namespace Placeframe.GeoConvert
{
    public readonly struct LatLonHeight
    {
        public LatLonHeight(double latitude, double longitude, double ellipsoidalHeight)
        {
            Latitude = latitude;
            Longitude = longitude;
            EllipsoidalHeight = ellipsoidalHeight;
        }

        public double Latitude { get; }
        public double Longitude { get; }
        public double EllipsoidalHeight { get; }
    }

    public readonly struct ECEF
    {
        public ECEF(double x, double y, double z)
        {
            X = x;
            Y = y;
            Z = z;
        }

        public double X { get; }
        public double Y { get; }
        public double Z { get; }
    }

    public readonly struct ENU
    {
        public ENU(double east, double north, double up)
        {
            East = east;
            North = north;
            Up = up;
        }

        public double East { get; }
        public double North { get; }
        public double Up { get; }
    }

    public readonly struct Ellipsoid
    {
        public Ellipsoid(string id, double semiMajorAxisMetres, double inverseFlattening)
        {
            Id = id;
            SemiMajorAxisMetres = semiMajorAxisMetres;
            InverseFlattening = inverseFlattening;
        }

        public string Id { get; }
        public double SemiMajorAxisMetres { get; }
        public double InverseFlattening { get; }
    }

    public enum GeoConvertErrorCode
    {
        NotFinite,
        OutOfRange,
        InvalidEcefOrigin,
        NonConvergent
    }

    public sealed class GeoConvertInputException : ArgumentException
    {
        public GeoConvertInputException(
            GeoConvertErrorCode code,
            string field,
            string message)
            : base(field + ": " + message, field)
        {
            Code = code;
            Field = field;
        }

        public GeoConvertErrorCode Code { get; }
        public string Field { get; }
    }

    public readonly struct GeodeticInverseResult
    {
        public GeodeticInverseResult(
            LatLonHeight position,
            int iterations,
            double toleranceRadians)
        {
            Position = position;
            Iterations = iterations;
            ToleranceRadians = toleranceRadians;
        }

        public LatLonHeight Position { get; }
        public string Algorithm => "bowring-iterative";
        public int Iterations { get; }
        public double ToleranceRadians { get; }
    }

    public sealed class EcefInverseOptions
    {
        public Ellipsoid Ellipsoid { get; set; } = GeoConvertMath.Wgs84Ellipsoid;
        public double ToleranceRadians { get; set; } = 1e-13;
        public int MaxIterations { get; set; } = 16;
    }

    public static class GeoConvertMath
    {
        public static readonly Ellipsoid Wgs84Ellipsoid = new Ellipsoid(
            "EPSG:7030",
            6_378_137.0,
            298.257223563);

        private const double DegreesToRadians = Math.PI / 180.0;
        private const double RadiansToDegrees = 180.0 / Math.PI;

        internal static double Finite(string field, double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value))
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.NotFinite,
                    field,
                    "must be a finite number");
            }

            return value;
        }

        private static void EllipsoidTerms(
            Ellipsoid ellipsoid,
            out double semiMinorAxis,
            out double eccentricitySquared)
        {
            double semiMajor = Finite(
                "ellipsoid.semiMajorAxisMetres",
                ellipsoid.SemiMajorAxisMetres);
            double inverseFlattening = Finite(
                "ellipsoid.inverseFlattening",
                ellipsoid.InverseFlattening);
            if (semiMajor <= 0.0)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.OutOfRange,
                    "ellipsoid.semiMajorAxisMetres",
                    "must be positive");
            }

            if (inverseFlattening <= 1.0)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.OutOfRange,
                    "ellipsoid.inverseFlattening",
                    "must be greater than one");
            }

            double flattening = 1.0 / inverseFlattening;
            semiMinorAxis = semiMajor * (1.0 - flattening);
            eccentricitySquared = flattening * (2.0 - flattening);
        }

        private static void ValidateGeodetic(
            LatLonHeight position,
            out double latitudeRadians,
            out double longitudeRadians)
        {
            double latitude = Finite("latitude", position.Latitude);
            double longitude = Finite("longitude", position.Longitude);
            Finite("ellipsoidalHeight", position.EllipsoidalHeight);
            if (latitude < -90.0 || latitude > 90.0)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.OutOfRange,
                    "latitude",
                    "must be between -90 and 90");
            }

            if (longitude < -180.0 || longitude > 180.0)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.OutOfRange,
                    "longitude",
                    "must be between -180 and 180");
            }

            latitudeRadians = latitude * DegreesToRadians;
            longitudeRadians = longitude * DegreesToRadians;
        }

        public static ECEF ToECEF(LatLonHeight position)
        {
            return ToECEF(position, Wgs84Ellipsoid);
        }

        public static ECEF ToECEF(LatLonHeight position, Ellipsoid ellipsoid)
        {
            ValidateGeodetic(position, out double latitude, out double longitude);
            EllipsoidTerms(ellipsoid, out _, out double eccentricitySquared);
            double sinLatitude = Math.Sin(latitude);
            double cosLatitude = Math.Cos(latitude);
            double radius = ellipsoid.SemiMajorAxisMetres
                / Math.Sqrt(1.0 - eccentricitySquared * sinLatitude * sinLatitude);
            return new ECEF(
                (radius + position.EllipsoidalHeight) * cosLatitude * Math.Cos(longitude),
                (radius + position.EllipsoidalHeight) * cosLatitude * Math.Sin(longitude),
                (radius * (1.0 - eccentricitySquared) + position.EllipsoidalHeight)
                    * sinLatitude);
        }

        public static LatLonHeight FromECEF(ECEF position)
        {
            return FromECEFDetailed(position, null).Position;
        }

        public static GeodeticInverseResult FromECEFDetailed(
            ECEF position,
            EcefInverseOptions options)
        {
            options = options ?? new EcefInverseOptions();
            EllipsoidTerms(
                options.Ellipsoid,
                out double semiMinorAxis,
                out double eccentricitySquared);
            if (double.IsNaN(options.ToleranceRadians)
                || double.IsInfinity(options.ToleranceRadians)
                || options.ToleranceRadians <= 0.0)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.OutOfRange,
                    "toleranceRadians",
                    "must be a finite positive number");
            }

            if (options.MaxIterations < 1)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.OutOfRange,
                    "maxIterations",
                    "must be positive");
            }

            double x = Finite("x", position.X);
            double y = Finite("y", position.Y);
            double z = Finite("z", position.Z);
            double distanceFromAxis = Math.Sqrt(x * x + y * y);
            double longitude = distanceFromAxis == 0.0 ? 0.0 : Math.Atan2(y, x);

            if (distanceFromAxis < 1e-9)
            {
                if (Math.Abs(z) < 1e-9)
                {
                    throw new GeoConvertInputException(
                        GeoConvertErrorCode.InvalidEcefOrigin,
                        "position",
                        "the ECEF origin has no geodetic coordinate");
                }

                return new GeodeticInverseResult(
                    new LatLonHeight(
                        z < 0.0 ? -90.0 : 90.0,
                        0.0,
                        Math.Abs(z) - semiMinorAxis),
                    0,
                    options.ToleranceRadians);
            }

            double latitude = Math.Atan2(
                z,
                distanceFromAxis * (1.0 - eccentricitySquared));
            int iterations = 0;
            bool converged = false;
            while (iterations < options.MaxIterations)
            {
                double sinLatitude = Math.Sin(latitude);
                double radius = options.Ellipsoid.SemiMajorAxisMetres
                    / Math.Sqrt(1.0 - eccentricitySquared * sinLatitude * sinLatitude);
                double next = Math.Atan2(
                    z + eccentricitySquared * radius * sinLatitude,
                    distanceFromAxis);
                iterations += 1;
                if (Math.Abs(next - latitude) <= options.ToleranceRadians)
                {
                    latitude = next;
                    converged = true;
                    break;
                }

                latitude = next;
            }

            if (!converged)
            {
                throw new GeoConvertInputException(
                    GeoConvertErrorCode.NonConvergent,
                    "position",
                    "ECEF inverse did not converge in "
                        + options.MaxIterations
                        + " iterations");
            }

            double finalSinLatitude = Math.Sin(latitude);
            double finalCosLatitude = Math.Cos(latitude);
            double finalRadius = options.Ellipsoid.SemiMajorAxisMetres
                / Math.Sqrt(
                    1.0 - eccentricitySquared * finalSinLatitude * finalSinLatitude);
            double height = Math.Abs(finalCosLatitude) > 1e-12
                ? distanceFromAxis / finalCosLatitude - finalRadius
                : z / finalSinLatitude - finalRadius * (1.0 - eccentricitySquared);
            return new GeodeticInverseResult(
                new LatLonHeight(
                    latitude * RadiansToDegrees,
                    longitude * RadiansToDegrees,
                    height),
                iterations,
                options.ToleranceRadians);
        }

        internal static double[] EcefToEnuRotation(
            double latitudeDegrees,
            double longitudeDegrees)
        {
            ValidateGeodetic(
                new LatLonHeight(latitudeDegrees, longitudeDegrees, 0.0),
                out double latitude,
                out double longitude);
            double sinLatitude = Math.Sin(latitude);
            double cosLatitude = Math.Cos(latitude);
            double sinLongitude = Math.Sin(longitude);
            double cosLongitude = Math.Cos(longitude);
            return new[]
            {
                -sinLongitude, cosLongitude, 0.0,
                -sinLatitude * cosLongitude, -sinLatitude * sinLongitude, cosLatitude,
                cosLatitude * cosLongitude, cosLatitude * sinLongitude, sinLatitude
            };
        }

        internal static double[] Transpose(double[] matrix)
        {
            return new[]
            {
                matrix[0], matrix[3], matrix[6],
                matrix[1], matrix[4], matrix[7],
                matrix[2], matrix[5], matrix[8]
            };
        }

        internal static double[] Multiply(double[] matrix, double[] vector)
        {
            return new[]
            {
                matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
                matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
                matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2]
            };
        }
    }

    public sealed class LocalFrame
    {
        private readonly double[] ecefToEnuRotation;

        private LocalFrame(string id, LatLonHeight origin, Ellipsoid ellipsoid)
        {
            Id = id;
            Origin = origin;
            Ellipsoid = ellipsoid;
            OriginECEF = GeoConvertMath.ToECEF(origin, ellipsoid);
            ecefToEnuRotation = GeoConvertMath.EcefToEnuRotation(
                origin.Latitude,
                origin.Longitude);
        }

        public string Id { get; }
        public LatLonHeight Origin { get; }
        public ECEF OriginECEF { get; }
        public Ellipsoid Ellipsoid { get; }
        internal double[] Rotation => (double[])ecefToEnuRotation.Clone();

        public static LocalFrame Create(LatLonHeight origin)
        {
            return new LocalFrame(null, origin, GeoConvertMath.Wgs84Ellipsoid);
        }

        public static LocalFrame Create(
            string id,
            LatLonHeight origin,
            Ellipsoid ellipsoid)
        {
            return new LocalFrame(id, origin, ellipsoid);
        }

        public ECEF ToECEF(ENU position)
        {
            double east = GeoConvertMath.Finite("east", position.East);
            double north = GeoConvertMath.Finite("north", position.North);
            double up = GeoConvertMath.Finite("up", position.Up);
            double[] displacement = GeoConvertMath.Multiply(
                GeoConvertMath.Transpose(ecefToEnuRotation),
                new[] { east, north, up });
            return new ECEF(
                OriginECEF.X + displacement[0],
                OriginECEF.Y + displacement[1],
                OriginECEF.Z + displacement[2]);
        }

        public ENU FromECEF(ECEF position)
        {
            double[] local = GeoConvertMath.Multiply(
                ecefToEnuRotation,
                new[]
                {
                    GeoConvertMath.Finite("x", position.X) - OriginECEF.X,
                    GeoConvertMath.Finite("y", position.Y) - OriginECEF.Y,
                    GeoConvertMath.Finite("z", position.Z) - OriginECEF.Z
                });
            return new ENU(local[0], local[1], local[2]);
        }

        public LatLonHeight ToGeodetic(ENU position)
        {
            return GeoConvertMath.FromECEFDetailed(
                ToECEF(position),
                new EcefInverseOptions { Ellipsoid = Ellipsoid }).Position;
        }

        public ENU FromGeodetic(LatLonHeight position)
        {
            return FromECEF(GeoConvertMath.ToECEF(position, Ellipsoid));
        }
    }

    public sealed class GeoPoint
    {
        private GeoPoint(LatLonHeight position)
        {
            GeoConvertMath.ToECEF(position);
            Position = position;
        }

        public LatLonHeight Position { get; }
        public double Latitude => Position.Latitude;
        public double Longitude => Position.Longitude;
        public double EllipsoidalHeight => Position.EllipsoidalHeight;

        public static GeoPoint FromPosition(LatLonHeight position)
        {
            return new GeoPoint(position);
        }

        public static GeoPoint FromLatLonHeight(
            double latitude,
            double longitude,
            double ellipsoidalHeight)
        {
            return new GeoPoint(
                new LatLonHeight(latitude, longitude, ellipsoidalHeight));
        }

        public static GeoPoint FromECEF(ECEF position)
        {
            return new GeoPoint(GeoConvertMath.FromECEF(position));
        }

        public static GeoPoint FromLocalENU(ENU position, LocalFrame frame)
        {
            return new GeoPoint(frame.ToGeodetic(position));
        }

        public ECEF ToECEF()
        {
            return GeoConvertMath.ToECEF(Position);
        }

        public ENU ToLocalENU(LocalFrame frame)
        {
            return frame.FromGeodetic(Position);
        }

        public LocalFrame LocalFrame(string id)
        {
            return Placeframe.GeoConvert.LocalFrame.Create(
                id,
                Position,
                GeoConvertMath.Wgs84Ellipsoid);
        }

        public GeoPoint TranslateENU(ENU offset)
        {
            return FromLocalENU(
                offset,
                Placeframe.GeoConvert.LocalFrame.Create(Position));
        }
    }
}
