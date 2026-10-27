import { createLocalFrame, fromEcef, toEcef } from "./geodesy.js";
import type {
  EcefPosition,
  GeodeticPosition,
  LocalEnuPosition,
  LocalFrame,
} from "./types.js";

/** Immutable convenience wrapper for one WGS 84 geodetic position. */
export class GeoPoint {
  readonly #position: GeodeticPosition;

  private constructor(position: GeodeticPosition) {
    this.#position = Object.freeze({ ...position });
    toEcef(this.#position);
  }

  static fromPosition(position: GeodeticPosition): GeoPoint {
    return new GeoPoint(position);
  }

  static fromLatLonHeight(
    latitude: number,
    longitude: number,
    ellipsoidalHeight: number,
  ): GeoPoint {
    return new GeoPoint({ latitude, longitude, ellipsoidalHeight });
  }

  static fromECEF(position: EcefPosition): GeoPoint {
    return new GeoPoint(fromEcef(position));
  }

  static fromLocalENU(position: LocalEnuPosition, frame: LocalFrame): GeoPoint {
    return new GeoPoint(frame.toGeodetic(position));
  }

  get latitude(): number {
    return this.#position.latitude;
  }

  get longitude(): number {
    return this.#position.longitude;
  }

  get ellipsoidalHeight(): number {
    return this.#position.ellipsoidalHeight;
  }

  toPosition(): GeodeticPosition {
    return { ...this.#position };
  }

  toECEF(): EcefPosition {
    return toEcef(this.#position);
  }

  toLocalENU(frame: LocalFrame): LocalEnuPosition {
    return frame.fromGeodetic(this.#position);
  }

  localFrame(id?: string): LocalFrame {
    return id === undefined
      ? createLocalFrame({ origin: this.#position })
      : createLocalFrame({ id, origin: this.#position });
  }

  /** Translate relative to the point's own east/north/ellipsoid-up frame. */
  translateENU(offset: LocalEnuPosition): GeoPoint {
    return GeoPoint.fromLocalENU(offset, this.localFrame());
  }

  toJSON(): GeodeticPosition {
    return this.toPosition();
  }
}
