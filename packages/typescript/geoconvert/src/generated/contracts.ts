/* Generated from contracts/schemas/geoconvert.schema.json. Do not edit by hand. */

export type GeoConvertDocument =
  | ConversionRequest
  | ConversionResult
  | ProductionReceipt
  | CapabilityManifest
  | GeoConvertError;
export type SemVerMajor1 = string;
export type CoordinateReferenceDeclaration = {
  [k: string]: any;
} & {
  reference_id: string;
  definition:
    | {
        kind: "authority";
        authority: string;
        code: number;
      }
    | {
        kind: "wkt2" | "projjson";
        value:
          | string
          | {
              [k: string]: any;
            };
      };
  realization: string;
  datum_anchor_epoch: number | null;
  frame_reference_epoch: number | null;
  coordinate_epoch: number | null;
  height_type: "none" | "ellipsoidal" | "orthometric";
  vertical_crs?: string | null;
  /**
   * @minItems 2
   * @maxItems 4
   */
  axes: [Axis, Axis] | [Axis, Axis, Axis] | [Axis, Axis, Axis, Axis];
  dimensionality: number;
  provenance: {
    source: string;
    retrieved_at: string | null;
    licence?: string | null;
  };
};
/**
 * @minItems 2
 * @maxItems 4
 */
export type CoordinateTuple =
  | [number, number]
  | [number, number, number]
  | [number, number, number, number];
export type Sha256 = string;

export interface ConversionRequest {
  schema_version: SemVerMajor1;
  source_crs: CoordinateReferenceDeclaration;
  target_crs: CoordinateReferenceDeclaration;
  area_of_interest: AreaOfInterest;
  operation_policy: OperationPolicy;
  /**
   * @minItems 1
   * @maxItems 1000000
   */
  coordinates: [CoordinateTuple, ...CoordinateTuple[]];
  source_coordinate_epoch?: number | null;
  target_coordinate_epoch: number | null;
  label?: string;
}
export interface Axis {
  name: string;
  abbreviation: string;
  direction: string;
  unit: string;
}
export interface AreaOfInterest {
  west: number;
  south: number;
  east: number;
  north: number;
  crosses_antimeridian: boolean;
  minimum_height?: number | null;
  maximum_height?: number | null;
  provenance: string;
  outside_behavior: "fail" | "partition";
}
export interface OperationPolicy {
  maximum_accuracy_metres: number;
  allow_ballpark: false;
  only_best: true;
  allow_superseded: boolean;
  network_policy: "offline";
  grid_licence_policy: "approved-only";
  axis_normalization: "declared-order";
  outside_area_behavior: "fail" | "partition";
  mode: "production" | "audit";
}
export interface ConversionResult {
  schema_version: SemVerMajor1;
  logical_request_id: Sha256;
  result_artifact_id: Sha256;
  coordinates: CoordinateTuple[];
  output_axes: Axis[];
  output_realization: string;
  target_frame_reference_epoch: number | null;
  target_coordinate_epoch: number | null;
  height_type: "none" | "ellipsoidal" | "orthometric";
  numeric_execution_profile_id: string;
  row_partitions: number[];
  /**
   * @minItems 1
   */
  operations: [OperationRecord, ...OperationRecord[]];
  failures: RowFailure[];
  warnings: string[];
  canonicalization: "RFC8785-JCS";
}
export interface OperationRecord {
  schema_version: SemVerMajor1;
  source_crs_hash: Sha256;
  target_crs_hash: Sha256;
  source_datum_anchor_epoch: number | null;
  source_frame_reference_epoch: number | null;
  source_coordinate_epoch: number | null;
  target_frame_reference_epoch: number | null;
  target_coordinate_epoch: number | null;
  name: string;
  authority: string | null;
  code: string | null;
  pipeline:
    | string
    | {
        [k: string]: any;
      };
  accuracy_metres: number | null;
  selection_area: AreaOfInterest;
  area_of_use: {
    [k: string]: any;
  } | null;
  axis_and_unit_steps: string[];
  resources: ResourceRecord[];
  runtime: {
    [k: string]: any;
  };
  policy: OperationPolicy;
  best_available: boolean;
  warnings: string[];
  limitations: string[];
  numeric_execution_profile_id: string;
}
export interface ResourceRecord {
  filename: string;
  package: string;
  version: string;
  sha256: Sha256;
  licence: string;
  available: boolean;
  source_url?: string | null;
  source_side_only?: boolean;
}
export interface RowFailure {
  row: number;
  code: string;
  message: string;
}
export interface ProductionReceipt {
  schema_version: SemVerMajor1;
  attempt_id: string;
  logical_run_id: Sha256;
  started_at: string;
  finished_at: string;
  request_hash: Sha256;
  result_hash: Sha256;
  source_commit: string;
  release_version: string;
  image_digest?: Sha256 | null;
  runtime_fingerprint: {
    [k: string]: any;
  };
  platform_architecture: string;
  numeric_execution_profile_id: string;
  resource_inventory_hash: Sha256;
  warnings: string[];
  failures: {
    [k: string]: any;
  }[];
  retry_history: {
    [k: string]: any;
  }[];
  exit_status: number;
}
export interface CapabilityManifest {
  schema_version: SemVerMajor1;
  contract_versions: SemVerMajor1[];
  formats: ("json" | "ndjson")[];
  dimensions: number[];
  production_target: "EPSG:10605@2024.0";
  numeric_execution_profile_id: string;
  runtime: {
    [k: string]: any;
  };
  resource_inventory_hash: Sha256;
  resources: ResourceRecord[];
  surfaces: ("python" | "cli" | "service-deferred" | "service-candidate")[];
}
export interface GeoConvertError {
  schema_version: SemVerMajor1;
  code: string;
  message: string;
  details: {
    [k: string]: any;
  };
}
