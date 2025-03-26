import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { SimpleDimensionLine } from "../../SimpleDimensionLine";
import { Mark } from "../../../core";
import { newDimensionMark } from "../../utils";
import convert from "convert-units";
interface Area {
  points: THREE.Vector3[];
  workingPlane: THREE.Plane | null;
  area: number;
}

export class AreaMeasureElement implements OBC.Hideable, OBC.Disposable {
  enabled: boolean = true;

  points: THREE.Vector3[] = [];

  workingPlane: THREE.Plane | null = null;

  labelMarker: Mark;

  world: OBC.World;

  components: OBC.Components;

  readonly onDisposed = new OBC.Event();

  readonly onAreaComputed = new OBC.Event<number>();

  readonly onWorkingPlaneComputed = new OBC.Event<THREE.Plane>();

  readonly onPointAdded = new OBC.Event<THREE.Vector3>();

  readonly onPointRemoved = new OBC.Event<THREE.Vector3>();

  private _visible = true;

  private _rotationMatrix: THREE.Matrix4 | null = null;

  private _dimensionLines: SimpleDimensionLine[] = [];

  private _defaultLineMaterial = new THREE.LineBasicMaterial({ color: "red" });

  /**
   * The rounding precision for all dimension lines.
   * Determines the number of decimal places to display.
   */
  private rounding: number = 2; // Default rounding precision

  /**
   * The display units for all dimension lines.
   * Determines the unit of measurement (e.g., "m", "cm", "mm").
   */
  private units: convert.Area = "m2"; // Default display unit

  /**
   * The unit of the input data (current world unit).
   */
  private worldUnit: convert.Distance = "m"; // Default to meters

  /**
   * The mesh used to fill the area for visualization.
   * This mesh represents the filled area in the 3D scene.
   */
  private fillMesh: THREE.Mesh | null = null;

  // private scale: number = 1;

  /** {@link OBC.Hideable.visible} */
  get visible() {
    return this._visible;
  }

  /** {@link OBC.Hideable.visible} */
  set visible(value: boolean) {
    this._visible = value;
    for (const dim of this._dimensionLines) {
      dim.visible = value;
      dim.label.visible = false;
    }
    this.labelMarker.visible = value;
  }

  constructor(
    components: OBC.Components,
    world: OBC.World,
    fillmaterial: THREE.Material,
    color?: THREE.Color | string,
    worldUnit?: convert.Distance,
    units?: convert.Area,
    rounding?: number,
    points?: THREE.Vector3[],
  ) {
    this.world = world;
    this.worldUnit = worldUnit || "m";
    this.units = units || "m2";
    this.rounding = rounding || 2;

    this.components = components;
    if (color) {
      // Convert the color to a THREE.Color instance if it's a string
      const newColor =
        typeof color === "string" ? new THREE.Color(color) : color;
      this._defaultLineMaterial.color = newColor;
      this._defaultLineMaterial.needsUpdate = true;
    }
    const htmlText = newDimensionMark();
    this.labelMarker = new Mark(world, htmlText);
    this.labelMarker.visible = false;
    this.labelMarker.three.renderOrder = 1;
    this.labelMarker.three.element.style.backgroundColor = `#${this._defaultLineMaterial.color.getHexString()}`;
    this.onPointAdded.add((point) => {
      if (this.points.length === 3 && !this._dimensionLines[2]) {
        this.addDimensionLine(point, this.points[0]);
        this.labelMarker.visible = true;
      }
    });
    points?.forEach((point) => this.setPoint(point));

    // Initialize the mesh with an empty geometry
    this.fillMesh = new THREE.Mesh(new THREE.BufferGeometry(), fillmaterial);
    this.fillMesh.visible = false; // Initially hide the mesh
    this.world.scene.three.add(this.fillMesh); // Add the mesh to the scene
  }

  setPoint(point: THREE.Vector3, index?: number) {
    let _index: number;
    if (!index) {
      _index = this.points.length === 0 ? 0 : this.points.length;
    } else {
      _index = index;
    }
    if (_index === 0) {
      this.points[0] = point;
      return;
    }
    if (_index < 0 || _index > this.points.length) return;
    const existingIndex = this.points.length > _index;
    this.points[_index] = point;
    this.onPointAdded.trigger(point);
    if (!existingIndex) {
      this.addDimensionLine(this.points[_index - 1], point);
    }
    const { previousLine, nextLine } = this.getLinesBetweenIndex(_index);
    if (previousLine) previousLine.endPoint = point;
    if (nextLine) nextLine.startPoint = point;

    this.updatePlaneMesh(this.fillMesh as THREE.Mesh, this.points);
  }

  removePoint(index: number) {
    if (this.points.length === 3) return;
    this.points.splice(index, 1);
    const { previousLine, nextLine } = this.getLinesBetweenIndex(index);
    if (nextLine) previousLine.endPoint = nextLine.endPoint;
    nextLine?.dispose();
    this._dimensionLines.splice(index, 1);
    this.onPointRemoved.trigger();
    this.updatePlaneMesh(this.fillMesh as THREE.Mesh, this.points);
  }

  toggleLabel() {
    this.labelMarker.toggleVisibility();
  }

  private addDimensionLine(start: THREE.Vector3, end: THREE.Vector3) {
    const dimensionLine = new SimpleDimensionLine(this.components, this.world, {
      start,
      end,
      lineMaterial: this._defaultLineMaterial,
      endpointElement: newDimensionMark(),
    });

    dimensionLine.toggleLabel();

    if (this._dimensionLines.length > 1) {
      this._dimensionLines.splice(
        this._dimensionLines.length - 1,
        0,
        dimensionLine,
      );
    } else {
      this._dimensionLines.push(dimensionLine);
    }
    return dimensionLine;
  }

  private getLinesBetweenIndex(index: number) {
    const previousLineIndex =
      index === 0 ? this._dimensionLines.length - 1 : index - 1;
    const previousLine = this._dimensionLines[previousLineIndex];
    const nextLine = this._dimensionLines[index];
    return { previousLine, nextLine };
  }

  computeWorkingPlane() {
    this.workingPlane = new THREE.Plane().setFromCoplanarPoints(
      this.points[0],
      this.points[1],
      this.points[2],
    );
    const referenceVector = new THREE.Vector3(0, 1, 0);

    const theta = this.workingPlane.normal.angleTo(referenceVector);

    const rotationAxis = new THREE.Vector3()
      .crossVectors(this.workingPlane.normal, referenceVector)
      .normalize();
    this._rotationMatrix = new THREE.Matrix4().makeRotationAxis(
      rotationAxis,
      theta,
    );
    this.onWorkingPlaneComputed.trigger(this.workingPlane);
  }

  computeArea() {
    if (!(this._rotationMatrix && this.workingPlane)) {
      this.onAreaComputed.trigger(0);
      return 0;
    }
    let xSum = 0;
    let ySum = 0;
    const rotMatrix = this._rotationMatrix;
    const vectors2D = this.points.map((point) => {
      const transformedPoint = point.clone().applyMatrix4(rotMatrix);
      const vector2D = new THREE.Vector2(
        transformedPoint.x,
        transformedPoint.z,
      );
      xSum += vector2D.x;
      ySum += vector2D.y;
      return vector2D;
    });
    const area = Math.abs(THREE.ShapeUtils.area(vectors2D));

    const utils = this.components.get(OBC.MeasurementUtils);
    const convertedValue = utils.convertUnits(
      area,
      `${this.worldUnit}2` as convert.Area, // Input unit (world unit)
      this.units, // Output unit (display unit)
      this.rounding, // Precision
    );

    // console.log(
    //   `${this.worldUnit}2 -> ${this.units} = ${convertedValue} ${this.units}`,
    // );
    this.labelMarker.three.element.textContent = `${convertedValue} ${this.units}`;
    this.labelMarker.three.position
      .set(
        xSum / vectors2D.length,
        -this.workingPlane.constant,
        ySum / vectors2D.length,
      )
      .applyMatrix4(rotMatrix.clone().invert());
    this.onAreaComputed.trigger(area);
    return area;
  }

  dispose() {
    this.onAreaComputed.reset();
    this.onWorkingPlaneComputed.reset();
    this.onPointAdded.reset();
    this.onPointRemoved.reset();
    for (const line of this._dimensionLines) {
      line.dispose();
    }
    this.labelMarker.dispose();
    this._dimensionLines = [];
    this.points = [];
    this._rotationMatrix = null;
    this.workingPlane = null;
    this._defaultLineMaterial.dispose();
    this.fillMesh?.removeFromParent();
    this.fillMesh?.geometry.dispose();
    this.onDisposed.trigger();
    this.onDisposed.reset();
  }

  get(): Area {
    return {
      points: this.points,
      workingPlane: this.workingPlane,
      area: this.computeArea(),
    };
  }

  /**
   * Sets the default material color and updates the color of every dimension line.
   *
   * @param color - The new color to apply to the default material and all dimension lines.
   */
  setColors(color: THREE.Color | string): void {
    // Convert the color to a THREE.Color instance if it's a string
    const newColor = typeof color === "string" ? new THREE.Color(color) : color;

    // Update the default line material color
    this._defaultLineMaterial.color = newColor;
    this._defaultLineMaterial.needsUpdate = true;

    // Update the color of all dimension lines
    for (const line of this._dimensionLines) {
      line.setColors(`#${newColor.getHexString()}`);
    }

    // Update the label marker background color
    this.labelMarker.three.element.style.backgroundColor = `#${newColor.getHexString()}`;
  }

  /**
   * Sets the world unit for the area measurement.
   *
   * @param unit - The new world unit (e.g., "m", "cm", "mm").
   */
  setWorldUnit(unit: convert.Distance | string): void {
    this.worldUnit = unit as convert.Distance;
    // Update the label to reflect the new unit
    this.computeArea();
  }

  /**
   * Sets the display units for the area measurement.
   *
   * @param unit - The new display unit (e.g., "m2", "cm2", "mm2").
   */
  setUnit(unit: convert.Area | string): void {
    this.units = unit as convert.Area;

    // Update the label to reflect the new unit
    this.computeArea();
  }

  /**
   * Sets the rounding precision for the area measurement.
   *
   * @param rounding - The new rounding precision (e.g., 0, 1, 2, etc.).
   * @throws {Error} If the rounding value is not a valid integer or is out of range (0-5).
   */
  setRounding(rounding: number): void {
    if (!Number.isInteger(rounding) || rounding < 0 || rounding > 5) {
      throw new Error("Rounding must be an integer between 0 and 5.");
    }

    this.rounding = rounding;

    // Update the label to reflect the new rounding precision
    this.computeArea();
  }

  /**
   * Updates a plane mesh by adding or removing a single vertex.
   * @param {THREE.Mesh} mesh - The existing plane mesh.
   * @param {THREE.Vector3[]} updatedVertices - The updated vertices (one added or removed).
   */
  updatePlaneMesh(mesh: THREE.Mesh, updatedVertices: THREE.Vector3[]): void {
    if (!mesh || !mesh.geometry) {
      // console.error("Invalid mesh or geometry. Cannot update plane mesh.");
      return;
    }
    if (updatedVertices.length < 3) {
      // console.error("At least 3 vertices are required to maintain a valid plane.");
      mesh.visible = false;
      return;
    }
    const geometry = mesh.geometry as THREE.BufferGeometry;

    let positionAttribute = geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    let positionArray = positionAttribute
      ? (positionAttribute.array as Float32Array) // use exist array
      : null;

    // Reuse existing buffer if large enough
    if (!positionArray || positionArray.length < updatedVertices.length * 3) {
      // Allocate a slightly larger buffer to reduce future allocations (e.g., +20%)
      // const newSize = Math.ceil(updatedVertices.length * 1.2) * 3;
      const newSize = updatedVertices.length * 3;
      positionArray = new Float32Array(newSize); // create new array
      positionAttribute = new THREE.BufferAttribute(positionArray, 3);
      geometry.setAttribute("position", positionAttribute);
    }

    // Update only the required positions
    for (let i = 0; i < updatedVertices.length; i++) {
      positionArray[i * 3] = updatedVertices[i].x;
      positionArray[i * 3 + 1] = updatedVertices[i].y;
      positionArray[i * 3 + 2] = updatedVertices[i].z;
    }

    // Find projection plane for 2D triangulation
    let axis1 = null;
    let axis2 = null;

    const normal = new THREE.Vector3()
      .subVectors(updatedVertices[1], updatedVertices[0])
      .cross(
        new THREE.Vector3().subVectors(updatedVertices[2], updatedVertices[0]),
      )
      .normalize();

    // Determine the two smallest components (axes with the least influence)
    if (
      Math.abs(normal.x) >= Math.abs(normal.y) &&
      Math.abs(normal.x) >= Math.abs(normal.z)
    ) {
      axis1 = new THREE.Vector3(0, 1, 0);
      axis2 = new THREE.Vector3(0, 0, 1); // Y and Z are lowest
    } else if (
      Math.abs(normal.y) >= Math.abs(normal.x) &&
      Math.abs(normal.y) >= Math.abs(normal.z)
    ) {
      axis1 = new THREE.Vector3(1, 0, 0);
      axis2 = new THREE.Vector3(0, 0, 1); // X and Z are lowest
    } else {
      axis1 = new THREE.Vector3(1, 0, 0);
      axis2 = new THREE.Vector3(0, 1, 0); // X and Y are lowest
    }
    // Convert 3D vertices to 2D for Earcut triangulation
    const vertices2D: THREE.Vector2[] = [];
    for (const v of updatedVertices) {
      vertices2D.push(new THREE.Vector2(v.dot(axis1), v.dot(axis2)));
    }

    // Generate triangle indices using Earcut
    const indicesArray = THREE.ShapeUtils.triangulateShape(vertices2D, []);
    if (indicesArray.length === 0) {
      console.warn("Triangulation failed. Ensure vertices form a valid shape.");
      return;
    }
    // Convert indices to a flat array
    const indices = indicesArray.flat();

    geometry.setIndex(indices); // Update face indices
    geometry.computeVertexNormals(); // Recalculate normals for correct shading
    positionAttribute.needsUpdate = true; // Mark for update
    mesh.position.copy(normal.setLength(0.01));
    mesh.visible = true; // Show the updated mesh
  }
}
