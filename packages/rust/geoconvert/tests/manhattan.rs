use placeframe_geoconvert::{
    Enu, GeoConvertErrorCode, GeoPoint, LatLonHeight, LocalCameraPose, LocalFrame,
    geopose_basic_quaternion_to_local_pose, local_pose_to_geopose_basic_quaternion, to_ecef,
};

fn close(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "{actual} != {expected}"
    );
}

fn manhattan() -> LocalFrame {
    LocalFrame::with_id(
        "frame-nyc-o1-v1",
        LatLonHeight {
            latitude: 40.712_809_728_153_16,
            longitude: -74.006_006_779_993_16,
            ellipsoidal_height: 8.758_042_892_441_154,
        },
    )
    .unwrap()
}

#[test]
fn midtown_round_trips_through_enu_and_ecef() {
    let frame = manhattan();
    let midtown = Enu {
        east: 1_731.070_133_330_654,
        north: 5_019.627_124_527_663,
        up: 12.786_684_010_304,
    };
    let point = GeoPoint::from_local_enu(midtown, &frame).unwrap();
    let ecef = point.to_ecef().unwrap();
    close(ecef.x, 1_334_764.126_623_927_2, 2e-6);
    close(ecef.y, -4_650_435.647_116_686, 2e-6);
    close(ecef.z, 4_142_119.930_247_306, 2e-6);
    let round_trip = GeoPoint::from_ecef(ecef)
        .unwrap()
        .to_local_enu(&frame)
        .unwrap();
    close(round_trip.east, midtown.east, 1e-6);
    close(round_trip.north, midtown.north, 1e-6);
    close(round_trip.up, midtown.up, 1e-6);
}

#[test]
fn generic_geopose_matches_the_independent_twenty_kilometre_control() {
    let frame = manhattan();
    let pose = LocalCameraPose {
        position: Enu {
            east: 12_000.0,
            north: 16_000.0,
            up: 250.0,
        },
        orientation_xyzw: [0.0, 0.0, 0.0, 1.0],
    };
    let geopose = local_pose_to_geopose_basic_quaternion(pose, &frame).unwrap();
    close(geopose.position.lat, 40.856_795_345_386_736, 1e-11);
    close(geopose.position.lon, -73.863_693_080_413_78, 1e-11);
    close(geopose.position.h, 290.146_458_867_006, 2e-6);
    close(geopose.quaternion.x, -0.001_256_510_248_484_981_7, 1e-12);
    close(geopose.quaternion.y, 0.000_940_343_265_681_622_9, 1e-12);
    close(geopose.quaternion.z, 0.000_811_247_373_079_128_3, 1e-12);
    close(geopose.quaternion.w, 0.999_998_439_405_901_3, 1e-12);
    let round_trip = geopose_basic_quaternion_to_local_pose(geopose, &frame).unwrap();
    close(round_trip.position.east, pose.position.east, 1e-8);
    close(round_trip.position.north, pose.position.north, 1e-8);
    close(round_trip.position.up, pose.position.up, 1e-8);
}

#[test]
fn invalid_latitude_names_the_field() {
    let error = to_ecef(LatLonHeight {
        latitude: 91.0,
        longitude: 0.0,
        ellipsoidal_height: 0.0,
    })
    .unwrap_err();
    assert_eq!(error.code, GeoConvertErrorCode::OutOfRange);
    assert_eq!(error.field, "latitude");
}
