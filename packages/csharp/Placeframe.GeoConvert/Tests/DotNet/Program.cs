using System;
using Placeframe.GeoConvert;

internal static class Program
{
    private static void Close(double actual, double expected, double tolerance)
    {
        if (Math.Abs(actual - expected) > tolerance)
        {
            throw new InvalidOperationException(actual + " != " + expected);
        }
    }

    private static int Main()
    {
        GeoPoint origin = GeoPoint.FromLatLonHeight(
            40.71280972815316,
            -74.00600677999316,
            8.758042892441154);
        LocalFrame manhattan = origin.LocalFrame("frame-nyc-o1-v1");
        ENU midtown = new ENU(
            1731.070133330654,
            5019.627124527663,
            12.786684010304);
        GeoPoint point = GeoPoint.FromLocalENU(midtown, manhattan);
        ECEF ecef = point.ToECEF();
        Close(ecef.X, 1334764.1266239272, 2e-6);
        Close(ecef.Y, -4650435.647116686, 2e-6);
        Close(ecef.Z, 4142119.930247306, 2e-6);
        ENU localAgain = GeoPoint.FromECEF(ecef).ToLocalENU(manhattan);
        Close(localAgain.East, midtown.East, 1e-6);
        Close(localAgain.North, midtown.North, 1e-6);
        Close(localAgain.Up, midtown.Up, 1e-6);

        LocalCameraPose pose = new LocalCameraPose(
            new ENU(12000.0, 16000.0, 250.0),
            new QuaternionXyzw(0.0, 0.0, 0.0, 1.0));
        BasicQuaternionGeoPose geoPose =
            GeoPoseMath.LocalPoseToGeoPoseBasicQuaternion(pose, manhattan);
        Close(geoPose.Position.Lat, 40.856795345386736, 1e-11);
        Close(geoPose.Position.Lon, -73.86369308041378, 1e-11);
        Close(geoPose.Position.H, 290.146458867006, 2e-6);
        LocalCameraPose poseAgain =
            GeoPoseMath.GeoPoseBasicQuaternionToLocalPose(geoPose, manhattan);
        Close(poseAgain.Position.East, pose.Position.East, 1e-8);
        Close(poseAgain.Position.North, pose.Position.North, 1e-8);
        Close(poseAgain.Position.Up, pose.Position.Up, 1e-8);

        try
        {
            GeoConvertMath.ToECEF(new LatLonHeight(91.0, 0.0, 0.0));
            throw new InvalidOperationException("invalid latitude was accepted");
        }
        catch (GeoConvertInputException error)
        {
            if (error.Code != GeoConvertErrorCode.OutOfRange
                || error.Field != "latitude")
            {
                throw;
            }
        }

        Console.WriteLine("Placeframe.GeoConvert Manhattan smoke passed.");
        return 0;
    }
}
