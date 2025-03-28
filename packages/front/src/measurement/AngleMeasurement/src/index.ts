import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { Mark } from "../../../core";
import { newDimensionMark, newEndPoint } from "../../utils";
import convert from "convert-units"; // Import the convert-units module

interface Angle {
  points: THREE.Vector3[];
  angle: number;
}

export class AngleMeasureElement implements OBC.Hideable, OBC.Disposable {
  enabled: boolean = true;

  visible: boolean = true;

  points: THREE.Vector3[] = [];
  endPoints: Mark[] = [];

  world: OBC.World;

  /**
   * The current unit for angle measurement (e.g., "deg", "rad").
   */
  public units: "deg" | "rad" | "grad" | "arcmin" | "arcsec" = "deg";

  public rounding: 0 | 1 | 2 | 3 | 4 | 5 = 2;

  readonly onDisposed = new OBC.Event();

  private _lineMaterial = new LineMaterial({
    color: 0x6528d7,
    linewidth: 2,
  });

  private _lineGeometry = new LineGeometry();
  private _line = new Line2(this._lineGeometry, this._lineMaterial);

  private _arcGeometry = new LineGeometry();
  private _arc = new Line2(this._arcGeometry, this._lineMaterial);

  private _labelMarker: Mark;

  readonly onAngleComputed = new OBC.Event<number>();
  readonly onSetNewPoint = new OBC.Event();

  set lineMaterial(material: LineMaterial) {
    this._lineMaterial.dispose();
    this._lineMaterial = material;
    this._line.material = material;
    this._lineMaterial.resolution.set(window.innerWidth, window.innerHeight);
    if (this._labelMarker)
      this._labelMarker.three.element.style.backgroundColor = `#${material.color.getHexString()}`;
    this.endPoints.forEach((item) => {
      item.three.element.style.backgroundColor = `#${material.color.getHexString()}`;
      item.three.element.style.borderColor = `#${material.color.getHexString()}`;
    });
  }

  get lineMaterial() {
    return this._lineMaterial;
  }

  set labelMarker(marker: Mark) {
    this._labelMarker.dispose();
    this._labelMarker = marker;
  }

  get labelMarker() {
    return this._labelMarker;
  }

  get angle(): Angle {
    return {
      points: this.points,
      angle: this.computeAngle(),
    };
  }

  constructor(world: OBC.World, points?: THREE.Vector3[]) {
    this.world = world;

    const htmlText = newDimensionMark();
    this._labelMarker = new Mark(world, htmlText);
    this._labelMarker.three.renderOrder = 1;
    this.labelMarker.visible = false;
    this.world.scene.three.add(this._line);
    this._line.visible = true;
    world.scene.three.add(this._arc);
    this._arc.visible = false;

    this.onSetNewPoint.add((data) => {
      // Type assertion to enforce expected structure
      const { index, point } = data as { index: number; point: THREE.Vector3 };
      if (index === 0) {
        this.points[0] = point;
        this.points[1] = point;
        this.points[2] = point;
        this.endPoints[index] = this.createEndpointElement(point);
      }
      if (index === 1) {
        this.points[1] = point;
        this.points[2] = point;
        this.labelMarker.visible = true;
        this.labelMarker.three.position.copy(point);
        const angle = this.computeAngle();
        this.displayConvertedAngle(angle);
      }
      if (index === 2) {
        this.endPoints[index] = this.createEndpointElement(point);
      }
    });

    this.onAngleComputed.add(() => {});

    points?.forEach((point) => this.setPoint(point));
  }

  setPoint(point: THREE.Vector3, index?: 0 | 1 | 2) {
    let _index: number;
    if (!index) {
      _index = this.points.length === 0 ? 0 : this.points.length;
    } else {
      _index = index;
    }
    if (![0, 1, 2].includes(_index)) return;

    this.points[_index] = point;

    if (_index > 1) {
      // create funct
      const angle = this.computeAngle();
      this.displayConvertedAngle(angle);
    }

    // update point
    // this.endPoints[_index].three.position.copy(point);
    // this.DrawArc3D();

    const points = this.points.map((point) => {
      return [point.x, point.y, point.z];
    });

    this._lineGeometry.setPositions(points.flat());
    // this._lineGeometry.setFromPoints(this.points);
    // this._lineGeometry.attributes.position.needsUpdate = true;
    // this._line.geometry.instanceCount = this.points.length;
    // this._lineGeometry.setDrawRange(0, this.points.length);
    // this._line.computeLineDistances();
    // this._lineGeometry.computeBoundingBox();
    // this._lineGeometry.computeBoundingSphere();
  }

  toggleLabel() {
    this.labelMarker.toggleVisibility();
  }

  computeAngle() {
    const v0 = this.points[0];
    const v1 = this.points[1];
    const v2 = this.points[2];
    if (!(v0 && v1 && v2)) return 0;
    const vA = new THREE.Vector3().subVectors(v1, v0);
    const vB = new THREE.Vector3().subVectors(v1, v2);
    const angle = THREE.MathUtils.radToDeg(vA.angleTo(vB));
    this.onAngleComputed.trigger(angle);
    return angle;
  }

  dispose() {
    this.points = [];
    this.labelMarker.dispose();
    this.endPoints.forEach((item) => item.dispose());
    this.onAngleComputed.reset();
    this.onSetNewPoint.reset();
    this.labelMarker.dispose();
    this._line.removeFromParent();
    this._lineMaterial.dispose();
    this._lineGeometry.dispose();
    this._arcGeometry.dispose();
    this._arc.removeFromParent();
    this.onDisposed.trigger();
    this.onDisposed.reset();
  }

  /**
   * Creates an endpoint marker
   *
   * @param point - The position of the endpoint as a THREE.Vector3.
   * @param index - The index of the endpoint to create (0, 1, or 2).
   *
   */
  private createEndpointElement(point: THREE.Vector3) {
    const marker = new Mark(this.world, newEndPoint());
    marker.three.position.copy(point);
    marker.three.element.style.backgroundColor = `#${this._lineMaterial.color.getHexString()}`;
    marker.three.element.style.borderColor = `#${this._lineMaterial.color.getHexString()}`;
    marker.three.renderOrder = 0;
    return marker;
  }

  static getSymbolFromUnit(newUnit: string) {
    const validUnits: string[] = ["deg", "rad", "grad", "arcmin", "arcsec"];
    if (!validUnits.includes(newUnit)) {
      throw new Error(
        `Invalid unit: ${newUnit}. Must be one of ${validUnits.join(", ")}.`,
      );
    }
    if (newUnit === "deg") return `°`;
    if (newUnit === "rad") return `rad`;
    if (newUnit === "grad") return `grad`;
    if (newUnit === "arcmin") return `′`;
    if (newUnit === "arcsec") return `″`;
    return "";
  }

  displayConvertedAngle(degAng: number) {
    // Validate the angle
    if (typeof degAng !== "number" || Number.isNaN(degAng)) {
      throw new Error("Invalid angle value. Must be a valid number.");
    }
    const convertedValue = convert(degAng).from("deg").to(this.units);
    const factor = 10 ** this.rounding; // Use ** operator for precision
    const convertedAngle = Math.round(convertedValue * factor) / factor; // Apply precision
    this.labelMarker.three.element.textContent = `${convertedAngle}${AngleMeasureElement.getSymbolFromUnit(this.units)}`;
  }

  /**
   * Sets the display units for the angle measurement element.
   *
   * @param unit - The new display unit ("deg" | "rad" | "grad" | "arcmin" | "arcsec").
   */
  setUnit(newUnit: string): void {
    if (!this.world) {
      throw new Error("World is required to change units!");
    }

    const validUnits: string[] = ["deg", "rad", "grad", "arcmin", "arcsec"];

    if (!validUnits.includes(newUnit)) {
      throw new Error(
        `Invalid unit: ${newUnit}. Must be one of ${validUnits.join(", ")}.`,
      );
    }

    this.units = newUnit as convert.Angle;
    const angle = this.computeAngle();
    this.displayConvertedAngle(angle);
  }

  /**
   * Sets the rounding precision for angle measurement element.
   *
   * @param rounding - The new rounding precision (0 to 5).
   * @throws {Error} If the rounding value is not a valid number between 0 and 5.
   */
  setRounding(rounding: 0 | 1 | 2 | 3 | 4 | 5): void {
    if (typeof rounding !== "number" || rounding < 0 || rounding > 5) {
      throw new Error(
        "Invalid rounding value. Must be a number between 0 and 5.",
      );
    }

    this.rounding = rounding;
    const angle = this.computeAngle();
    this.displayConvertedAngle(angle);
  }

  /**
   * Creates a smooth arc (bow) between two radius vectors in 3D space.
   */
  DrawArc3D(): void {
    const v0 = this.points[0];
    const v1 = this.points[1];
    const v2 = this.points[2];
    if (!(v0 && v1 && v2)) {
      this._arc.visible = false;
      return;
    }
    console.log("draw3d", this.points);

    const segments = 20;
    const r = 0.5;
    // Normalize start & end vectors
    const startNorm = v0.clone().subVectors(v0, v1).normalize();
    const endNorm = v2.clone().subVectors(v2, v1).normalize();

    // Find center of the arc (assuming a circular path)
    // const center = v1;

    // Compute the normal axis to rotate around
    const normal = new THREE.Vector3()
      .crossVectors(startNorm, endNorm)
      .normalize();

    // Calculate the angle between start and end vectors
    let angle = startNorm.angleTo(endNorm);

    // Ensure the arc is ≤ 180° by flipping endVector if necessary
    if (angle > Math.PI) {
      angle = Math.PI - (angle - Math.PI); // Adjust angle to take the shorter path
      endNorm.negate(); // Flip end vector direction
    }

    // Generate arc points
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments; // Normalized position between 0 and 1
      const theta = angle * t; // Interpolated angle

      // Rotate start vector around the normal axis
      const point = startNorm
        .clone()
        .applyAxisAngle(normal, theta)
        .multiplyScalar(r);
      points.push(point);
    }

    // Create a Three.js curve geometry from the points
    this._arcGeometry.setFromPoints(points);
    this._arc.visible = true;
  }
}
