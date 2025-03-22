import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { Mark } from "../../core";
import { newDimensionMark } from "../utils";
import convert from "convert-units";

/**
 * Interface representing the data required to create a dimension line.
 */
export interface DimensionData {
  /**
   * The starting point of the dimension line in 3D space.
   */
  start: THREE.Vector3;

  /**
   * The ending point of the dimension line in 3D space.
   */
  end: THREE.Vector3;

  /**
   * The material to be used for the line of the dimension.
   */
  lineMaterial: THREE.Material;

  /**
   * The HTML element to be used as the endpoint marker for the dimension line.
   */
  endpointElement: HTMLElement;
}

// TODO: Clean up this: way less parameters, clearer logic

/**
 * A class representing a simple dimension line in a 3D space.
 */
export class SimpleDimensionLine {
  /**
   * The label for the dimension line.
   */
  label: Mark;

  /**
   * The bounding box for the dimension line.
   */
  boundingBox = new THREE.Mesh();

  /**
   * The world in which the dimension line exists.
   */
  world: OBC.World;

  /**
   * The components used by the dimension line.
   */
  components: OBC.Components;

  /**
   * The scale factor for the dimension line.
   */
  static scale = 1;

  /**
   * The units used for the dimension line.
   */
  private units: convert.Distance = "m";

  /**
   * Getter for the units of the dimension line.
   * @returns {convert.Distance} The current units.
   */
  getUnits(): convert.Distance {
    return this.units;
  }

  /**
   * Setter for the units of the dimension line.
   * Updates the units and refreshes the label.
   * @param {convert.Distance} newUnits - The new units for the dimension line.
   */
  setUnits(newUnits: convert.Distance): void {
    this.units = newUnits;
    this.updateLabel();
  }

  /**
   * The number of decimals to show in the label.
   */
  private rounding = 2;

  /**
   * Getter for the rounding precision of the dimension line.
   * @returns {number} The current rounding precision.
   */
  getRounding(): number {
    return this.rounding;
  }

  /**
   * Setter for the rounding precision of the dimension line.
   * Updates the rounding precision and refreshes the label.
   * @param {number} newRounding - The new rounding precision.
   */
  setRounding(newRounding: number): void {
    this.rounding = newRounding;
    this.updateLabel();
  }

  /**
   * A static array to keep track of all instances of SimpleDimensionLine.
   */
  private static instances: SimpleDimensionLine[] = [];

  /**
   * The unit of the input data (current world unit).
   */
  private static _worldUnit: convert.Distance = "m"; // Default to meters

  /**
   * Getter for the input unit of the dimension line.
   * @returns {string} The current input unit.
   */
  static get worldUnit(): string {
    return SimpleDimensionLine._worldUnit;
  }

  /**
   * Setter for the input unit of the dimension line.
   * @param {string} unit - The new input unit (e.g., "m", "cm", "mm") convert-units module type Distance.
   */
  static set worldUnit(unit: convert.Distance) {
    SimpleDimensionLine._worldUnit = unit;
    // Call updateLabel for all instances
    SimpleDimensionLine.instances.forEach((instance) => instance.updateLabel());
  }

  private _length: number;

  private _visible = true;

  private _start: THREE.Vector3;

  private _end: THREE.Vector3;

  private readonly _root = new THREE.Group();

  private readonly _endpoints: Mark[] = [];

  private readonly _line: THREE.Line;

  /**
   * Getter for the visibility of the dimension line.
   * @returns {boolean} The current visibility state.
   */
  get visible() {
    return this._visible;
  }

  /**
   * Setter for the visibility of the dimension line.
   * @param {boolean} value - The new visibility state.
   */
  set visible(value: boolean) {
    this._visible = value;
    this.label.visible = value;
    this._endpoints[0].visible = value;
    this._endpoints[1].visible = value;

    const [endpoint1, endpoint2] = this._endpoints;
    const ep1Object = endpoint1.three;
    const ep2Object = endpoint2.three;
    const label = this.label.three;

    if (value) {
      this.world.scene.three.add(this._root);
      this._root.add(label, ep1Object, ep2Object);
    } else {
      label.removeFromParent();
      ep1Object.removeFromParent();
      ep2Object.removeFromParent();
      this._root.removeFromParent();
    }
  }

  /**
   * Getter for the end point of the dimension line.
   * @returns {THREE.Vector3} The current end point.
   */
  get endPoint() {
    return this._end;
  }

  /**
   * Setter for the end point of the dimension line.
   * Updates the line geometry and position of the end point marker.
   * @param {THREE.Vector3} point - The new end point.
   */
  set endPoint(point: THREE.Vector3) {
    this._end = point;
    const position = this._line.geometry.attributes
      .position as THREE.BufferAttribute;
    position.setXYZ(1, point.x, point.y, point.z);
    position.needsUpdate = true;
    this._endpoints[1].three.position.copy(point);
    this.updateLabel();
  }

  /**
   * Getter for the start point of the dimension line.
   * @returns {THREE.Vector3} The current start point.
   */
  get startPoint() {
    return this._start;
  }

  /**
   * Setter for the start point of the dimension line.
   * Updates the line geometry and position of the start point marker.
   * @param {THREE.Vector3} point - The new start point.
   */
  set startPoint(point: THREE.Vector3) {
    this._start = point;
    const position = this._line.geometry.attributes
      .position as THREE.BufferAttribute;
    position.setXYZ(0, point.x, point.y, point.z);
    position.needsUpdate = true;
    this._endpoints[0].three.position.copy(point);
    this.updateLabel();
  }

  private get _center() {
    let dir = this._end.clone().sub(this._start);
    const len = dir.length() * 0.5;
    dir = dir.normalize().multiplyScalar(len);
    return this._start.clone().add(dir);
  }

  constructor(
    components: OBC.Components,
    world: OBC.World,
    data: DimensionData,
  ) {
    this.components = components;
    this.world = world;

    this._start = data.start;
    this._end = data.end;
    this._length = this.getLength();
    this._line = this.createLine(data);

    this.newEndpointElement(data.endpointElement);
    // @ts-ignore
    this.newEndpointElement(data.endpointElement.cloneNode(true));
    this.label = this.newText();
    this._root.renderOrder = 2;
    this.world.scene.three.add(this._root);

    // Add this instance to the static instances array
    SimpleDimensionLine.instances.push(this);
  }

  /**
   * Disposes of the dimension line and its associated resources.
   * This method should be called when the dimension line is no longer needed.
   * It removes the dimension line from the world, destroys its components, and frees up memory.
   */
  dispose() {
    const disposer = this.components.get(OBC.Disposer);
    this.visible = false;
    disposer.destroy(this._root as any);
    disposer.destroy(this._line as any);
    for (const marker of this._endpoints) {
      marker.dispose();
    }
    this._endpoints.length = 0;
    this.label.dispose();
    if (this.boundingBox) {
      disposer.destroy(this.boundingBox);
    }
    (this.components as any) = null;
  }

  /**
   * Creates a bounding box for the dimension line.
   * The bounding box is a 3D box that encloses the dimension line.
   * It is used for collision detection and visibility culling.
   * The bounding box is initially invisible and can be toggled using the `toggleBoundingBox` method.
   */
  createBoundingBox() {
    this.boundingBox.geometry = new THREE.BoxGeometry(1, 1, this._length);
    this.boundingBox.position.copy(this._center);
    this.boundingBox.lookAt(this._end);
    this.boundingBox.visible = false;
    this._root.add(this.boundingBox);
  }

  /**
   * Toggles the visibility of the dimension line's label.
   * The label is a text element that displays the length of the dimension line.
   * This method is used to show or hide the label when needed.
   */
  toggleLabel() {
    this.label.toggleVisibility();
  }

  private newEndpointElement(element: HTMLElement) {
    const isFirst = this._endpoints.length === 0;
    const position = isFirst ? this._start : this._end;
    const marker = new Mark(this.world, element);
    marker.three.position.copy(position);
    this._endpoints.push(marker);
    this._root.add(marker.three);
  }

  private updateLabel() {
    this._length = this.getLength();
    this.label.three.element.textContent = this.getTextContent();
    this.label.three.position.copy(this._center);
    this._line.computeLineDistances();
  }

  private createLine(data: DimensionData) {
    const axisGeom = new THREE.BufferGeometry();
    axisGeom.setFromPoints([data.start, data.end]);
    const line = new THREE.Line(axisGeom, data.lineMaterial);
    this._root.add(line);
    return line;
  }

  private newText() {
    const htmlText = newDimensionMark();
    htmlText.textContent = this.getTextContent();
    const label = new Mark(this.world, htmlText);
    label.three.position.copy(this._center);
    this._root.add(label.three);
    return label;
  }

  private getTextContent() {
    // Convert the length from the world unit to the display unit
    const utils = this.components.get(OBC.MeasurementUtils);
    const convertedValue = utils.convertUnits(
      this._length / SimpleDimensionLine.scale,
      SimpleDimensionLine._worldUnit, // Input unit (world unit)
      this.units, // Output unit (display unit)
      this.rounding, // Precision
    );

    // Format the converted value with the display unit
    return `${convertedValue} ${this.units}`;
  }

  private getLength() {
    return this._start.distanceTo(this._end);
  }
}
