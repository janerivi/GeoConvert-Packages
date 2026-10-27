export type GeoConvertInputErrorCode =
  | "not-finite"
  | "out-of-range"
  | "invalid-ecef-origin"
  | "non-convergent";

/** A stable, field-addressable error from the local arithmetic API. */
export class GeoConvertInputError extends RangeError {
  readonly code: GeoConvertInputErrorCode;
  readonly field: string;

  constructor(code: GeoConvertInputErrorCode, field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "GeoConvertInputError";
    this.code = code;
    this.field = field;
  }
}
