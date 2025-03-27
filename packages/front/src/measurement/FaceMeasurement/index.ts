import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { Mark } from "../../core";
import { newDimensionMark } from "../utils";
import { SimpleDimensionLine } from "../SimpleDimensionLine";
import convert from "convert-units";

/**
 * Represents a selection made by the user, containing area, perimeter, mesh, and label.
 */
export interface AreaSelection {
  /**
   * The calculated area of the selection.
   */
  area: number;

  /**
   * The calculated perimeter of the selection.
   */
  perimeter: number;

  /**
   * The 3D mesh representing the selection.
   */
  mesh: THREE.Mesh;

  /**
   * The label associated with the selection.
   */
  label: Mark;

  edges: any[]; // MeasureEdge

  dimensionLines: SimpleDimensionLine[]; // border edges
}

/**
 * Represents a serialized version of an AreaSelection, used for saving and loading measurements.
 */
export interface SerializedAreaMeasure {
  /**
   * The position of the vertices in the selection.
   */
  position: Float32Array;

  /**
   * The calculated perimeter of the selection.
   */
  perimeter: number;

  /**
   * The calculated area of the selection.
   */
  area: number;

  edges: any[];
}

/**
 * This component allows users to measure geometry faces in a 3D scene. 📕 [Tutorial](https://docs.thatopen.com/Tutorials/Components/Front/FaceMeasurement). 📘 [API](https://docs.thatopen.com/api/@thatopen/components-front/classes/FaceMeasurement).
 */
export class FaceMeasurement
  extends OBC.Component
  implements OBC.Createable, OBC.Disposable
{
  /**
   * A unique identifier for the component.
   * This UUID is used to register the component within the Components system.
   */
  static readonly uuid = "30279548-1309-44f6-aa97-ce26eed73522" as const;

  /** {@link OBC.Disposable.onDisposed} */
  readonly onDisposed = new OBC.Event();

  /**
   * An array of AreaSelection objects representing the user's selections.
   * This array is used to store the selected areas, their meshes, and labels.
   */
  selection: AreaSelection[] = [];

  /**
   * A reference to the preview dimension face.
   * This line is used to visualize the measurement while creating it.
   */
  preview = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      side: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.25,
      color: "#BCF124",
    }),
  );

  /**
   * Represents the material used for the selected area in the FaceMeasurement component.
   * This material is applied to the 3D mesh representing the selected area.
   */
  selectionMaterial = new THREE.MeshBasicMaterial({
    side: 2,
    depthTest: false,
    transparent: true,
    color: "#BCF124",
    opacity: 0.75,
  });

  borderMaterial = new THREE.LineBasicMaterial({
    side: 2,
    depthTest: false,
    transparent: false,
    color: "#0000FF",
  });

  private _labelMarkColor: string = "#0000FF"; // Default label mark color

  /**
   * The unit of the input data (current world unit).
   */
  private worldUnit: convert.Distance = "m"; // Default to meters

  /**
   * The display units for the face measurement.
   * Determines the unit of measurement (e.g., "m2", "cm2", "mm2").
   */
  private units: convert.Area = "m2"; // Default display unit

  /**
   * The rounding precision for face measurement.
   * Determines the number of decimal places to display.
   */
  private rounding: number = 2; // Default rounding precision

  // private scale: number = 1;

  /**
   * The world in which the measurements are performed.
   */
  world?: OBC.World;

  private _enabled: boolean = false;

  private _currentSelelection: {
    area: number;
    perimeter: number; // unit is "m"
    edges: any[];
  } | null = null;

  /** {@link OBC.Component.enabled} */
  set enabled(value: boolean) {
    if (!this.world) {
      throw new Error("No world given for the Face measurement!");
    }
    this._enabled = value;
    this.setupEvents(value);
    if (value) {
      const scene = this.world.scene.three;
      scene.add(this.preview);
    } else {
      this.preview.removeFromParent();
      this.cancelCreation();
    }
    this.setVisibility(value);
  }

  /** {@link OBC.Component.enabled} */
  get enabled() {
    return this._enabled;
  }

  constructor(components: OBC.Components) {
    super(components);
    this.components.add(FaceMeasurement.uuid, this);
    this.preview.frustumCulled = false;
  }

  /** {@link OBC.Disposable.dispose} */
  dispose() {
    this.setupEvents(false);
    this.deleteAll();
    this.preview.removeFromParent();
    this.preview.material.dispose();
    this.preview.geometry.dispose();
    this.selectionMaterial.dispose();
    this.borderMaterial.dispose();
    this.onDisposed.trigger();
    this.onDisposed.reset();
    (this.components as any) = null;
  }

  /** {@link OBC.Createable.create} */
  create = () => {
    if (!this.world) {
      throw new Error("No world given to the face measurement!");
    }

    if (!this.enabled || !this._currentSelelection) return;

    // Validate the preview object
    if (
      !this.preview ||
      !this.preview.geometry ||
      !this.preview.geometry.attributes.position
    ) {
      throw new Error(
        "Invalid preview object. Ensure the preview has valid geometry.",
      );
    }

    const scene = this.world.scene.three;

    const geometry = new THREE.BufferGeometry();
    const mesh = new THREE.Mesh(geometry, this.selectionMaterial);
    geometry.setAttribute(
      "position",
      this.preview.geometry.attributes.position,
    );
    // mesh.position.copy(this.preview.position);
    mesh.matrixWorld.copy(this.preview.matrix);
    mesh.updateMatrixWorld();
    scene.add(mesh);

    geometry.computeBoundingSphere();
    const { area, perimeter, edges } = this._currentSelelection;

    const label = this.newLabel(geometry, area);
    mesh.add(label.three);

    const dimensionLines: SimpleDimensionLine[] = [];

    for (const { points } of edges) {
      dimensionLines.push(this.addDimensionLine(points[0], points[1]));
    }

    this.selection.push({
      area,
      perimeter,
      mesh,
      label,
      edges,
      dimensionLines,
    });
  };

  /** {@link OBC.Createable.delete} */
  delete() {
    if (!this.world) {
      throw new Error("No world given to the face measurement!");
    }
    const meshes = this.selection.map((item) => item.mesh);

    const casters = this.components.get(OBC.Raycasters);
    const caster = casters.get(this.world);
    const result = caster.castRay(meshes);
    if (!result || !result.object) {
      return;
    }
    const found = this.selection.find((item) => item.mesh === result.object);
    if (!found) return;
    found.mesh.removeFromParent();
    found.mesh.geometry.dispose();
    found.label.dispose();
    for (const line of found.dimensionLines) {
      line.dispose();
    }
    const index = this.selection.indexOf(found);
    this.selection.splice(index, 1);
  }

  /**
   * Deletes all the selections made by the user.
   * It iterates over the `selection` array, removes each mesh and label from the scene,
   * disposes the geometry and material of the mesh, and finally clears the `selection` array.
   */
  deleteAll() {
    for (const item of this.selection) {
      item.mesh.removeFromParent();
      item.mesh.geometry.dispose();
      item.label.dispose();
      for (const line of item.dimensionLines) {
        line.dispose();
      }
    }
    this.selection = [];
  }

  /** {@link OBC.Createable.endCreation} */
  endCreation() {}

  /** {@link OBC.Createable.cancelCreation} */
  cancelCreation() {}

  /**
   * Retrieves the current state of the AreaMeasurement component in a serialized format.
   * This method is used for saving measurements.
   *
   * @returns {SerializedAreaMeasure[]} An array of SerializedAreaMeasure objects,
   * each representing a single selection made by the user.
   */
  get() {
    const serialized: SerializedAreaMeasure[] = [];
    for (const item of this.selection) {
      const geometry = item.mesh.geometry;
      const { area, perimeter, edges } = item;
      const position = geometry.attributes.position.array as Float32Array;
      serialized.push({ position, area, perimeter, edges });
    }
    return serialized;
  }

  /**
   * Sets the state of the AreaMeasurement component from a serialized format.
   * This method is used for loading measurements.
   *
   * @param serialized - An array of SerializedAreaMeasure objects,
   * each representing a single selection made by the user.
   *
   * @throws Will throw an error if no world is given to the face measurement.
   */
  set(serialized: SerializedAreaMeasure[]) {
    if (!this.world) {
      throw new Error("No world given to the face measurement!");
    }
    const scene = this.world.scene.three;
    for (const item of serialized) {
      const geometry = new THREE.BufferGeometry();
      const mesh = new THREE.Mesh(geometry, this.selectionMaterial);
      scene.add(mesh);
      const attr = new THREE.BufferAttribute(item.position, 3);
      geometry.setAttribute("position", attr);
      geometry.computeBoundingSphere();
      const { area, perimeter, edges } = item;
      const label = this.newLabel(geometry, area);
      mesh.add(label.three);

      const dimensionLines: SimpleDimensionLine[] = [];

      for (const { points } of edges) {
        dimensionLines.push(this.addDimensionLine(points[0], points[1]));
      }
      this.selection.push({
        area,
        perimeter,
        mesh,
        label,
        edges,
        dimensionLines,
      });
    }
  }

  private setupEvents(active: boolean) {
    if (!this.world) {
      throw new Error("The face measurement needs a world to work!");
    }
    if (this.world.isDisposing) {
      return;
    }
    if (!this.world.renderer) {
      throw new Error("The world of the face measurement needs a renderer!");
    }
    const canvas = this.world.renderer.three.domElement;
    const viewerContainer = canvas.parentElement as HTMLElement;

    viewerContainer.removeEventListener("pointermove", this.onMouseMove);
    window.removeEventListener("keydown", this.onKeydown);

    if (active) {
      viewerContainer.addEventListener("pointermove", this.onMouseMove);
      window.addEventListener("keydown", this.onKeydown);
    }
  }

  private setVisibility(active: boolean) {
    if (!this.world) {
      throw new Error("The face measurement needs a world to work!");
    }
    if (this.world.isDisposing) {
      return;
    }
    const scene = this.world.scene.three;
    for (const item of this.selection) {
      const label = item.label.three;
      if (active) {
        scene.add(item.mesh);
        item.mesh.add(label);
        for (const line of item.dimensionLines) {
          line.visible = true;
        }
      } else {
        item.mesh.removeFromParent();
        label.removeFromParent();
        for (const line of item.dimensionLines) {
          line.visible = false;
        }
      }
    }
  }

  private onMouseMove = () => {
    if (!this.world) {
      throw new Error("The face measurement needs a world to work!");
    }
    if (!this.enabled) {
      this.unselect();
      return;
    }
    const casters = this.components.get(OBC.Raycasters);
    const caster = casters.get(this.world);
    const result = caster.castRay();
    if (!result || !result.object || result.faceIndex === undefined) {
      this.unselect();
      return;
    }
    const { object, faceIndex } = result;
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      this.updateSelection(object, faceIndex, result.instanceId);
    } else {
      this.unselect();
    }
  };

  private onKeydown = (_e: KeyboardEvent) => {};

  private unselect() {
    this.preview.removeFromParent();
    this._currentSelelection = null;
  }

  private updateSelection(
    mesh: THREE.Mesh | THREE.InstancedMesh,
    faceIndex: number,
    instance?: number,
  ) {
    if (!this.world) {
      throw new Error("The face measurement needs a world to work!");
    }
    const scene = this.world.scene.three;
    scene.add(this.preview);

    const measurements = this.components.get(OBC.MeasurementUtils);
    const result = measurements.getFace(mesh, faceIndex, instance);
    if (result === null) {
      return;
    }

    const area = this.regenerateHighlight(mesh, result.indices, instance);

    let perimeter = 0;
    for (const { distance } of result.edges) {
      perimeter += distance;
    }

    this._currentSelelection = {
      perimeter,
      area,
      edges: result.edges,
    };
  }

  private newLabel(geometry: THREE.BufferGeometry, area: number) {
    if (!geometry.boundingSphere) {
      throw new Error("Error computing area geometry");
    }
    if (!this.world) {
      throw new Error("The face measurement needs a world to work!");
    }
    const { center } = geometry.boundingSphere;
    const htmlText = newDimensionMark();
    // const formattedArea = Math.trunc(area * 100) / 100;

    const utils = this.components.get(OBC.MeasurementUtils);
    const convertedArea = utils.convertUnits(
      area,
      `${this.worldUnit}2` as convert.Area, // Input unit (world unit)
      this.units as convert.Area, // Output unit (display unit)
      this.rounding, // Precision
    );
    htmlText.textContent = `${convertedArea} ${this.units}`;
    const label = new Mark(this.world, htmlText);
    const labelObject = label.three;
    labelObject.position.copy(center);
    label.three.renderOrder = 1;
    labelObject.element.style.backgroundColor = this._labelMarkColor;
    return label;
  }

  private regenerateHighlight(
    mesh: THREE.Mesh | THREE.InstancedMesh,
    indices: Iterable<number>,
    instance?: number,
  ) {
    const position: number[] = [];
    const index: number[] = [];
    let counter = 0;

    let area = 0;
    const areaTriangle = new THREE.Triangle();

    const measurements = this.components.get(OBC.MeasurementUtils);

    for (const i of indices) {
      const { p1, p2, p3 } = measurements.getVerticesAndNormal(
        mesh,
        i,
        instance,
      );

      position.push(p1.x, p1.y, p1.z);
      position.push(p2.x, p2.y, p2.z);
      position.push(p3.x, p3.y, p3.z);

      areaTriangle.set(p1, p2, p3);
      area += areaTriangle.getArea();

      index.push(counter, counter + 1, counter + 2);
      counter += 3;
    }

    this.preview.position.set(0, 0, 0);
    this.preview.rotation.set(0, 0, 0);
    this.preview.scale.set(1, 1, 1);
    this.preview.updateMatrix();

    this.preview.applyMatrix4(mesh.matrixWorld);

    const buffer = new Float32Array(position);
    const attr = new THREE.BufferAttribute(buffer, 3);
    this.preview.geometry.setAttribute("position", attr);
    this.preview.geometry.setIndex(index);

    return area;
  }

  private addDimensionLine(start: THREE.Vector3, end: THREE.Vector3) {
    if (!this.world) {
      throw new Error("World is required to create a dimension line!");
    }
    const dimensionLine = new SimpleDimensionLine(this.components, this.world, {
      start,
      end,
      lineMaterial: this.borderMaterial,
      endpointElement: newDimensionMark(),
    });

    dimensionLine.toggleLabel();

    return dimensionLine;
  }

  /**
   * Sets the color of the border material and updates all dimension lines in the selection.
   *
   * @param color - The new color to apply to the border material as a THREE.Color instance or a string (e.g., "#FF0000").
   * @throws {Error} If the color is not a valid hex string or a THREE.Color instance.
   */
  setBorderColor(color: THREE.Color | string): void {
    // Validate the color parameter
    if (typeof color === "string") {
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        throw new Error("Invalid color format. Must be a hex color string.");
      }
    } else if (!(color instanceof THREE.Color)) {
      throw new Error(
        "Invalid color. Must be a THREE.Color instance or a hex string.",
      );
    }

    // Convert the color to a THREE.Color instance if it's a string
    const newColor = typeof color === "string" ? new THREE.Color(color) : color;

    // Update the border material's color
    this.borderMaterial.color = newColor;
    this.borderMaterial.needsUpdate = true; // Ensure the material updates in the scene

    // Update the color of all dimension lines in the selection
    for (const item of this.selection) {
      for (const dimensionLine of item.dimensionLines) {
        dimensionLine.setColors(`#${this.borderMaterial.color.getHexString()}`); // Ensure the material updates
      }
    }
  }

  /**
   * Gets the current color of the border material.
   *
   * @returns The current border color as a THREE.Color instance.
   */
  getBorderColor(): THREE.Color {
    return this.borderMaterial.color;
  }

  /**
   * Sets the color of the label mark for all selections.
   *
   * @param color - The new color to apply to the label mark.as string ex: "#0000FF"
   */
  setLabelMarkerColor(color: string): void {
    if (!/^#[0-9A-F]{6}$/i.test(color)) {
      throw new Error("Invalid color format. Must be a hex color string.");
    }
    this._labelMarkColor = color;

    // Update the color of all existing label marks
    for (const item of this.selection) {
      item.label.three.element.style.backgroundColor = color;
    }
  }

  /**
   * Gets the current color of the label mark.
   *
   * @returns The current label mark color as a string.
   */
  getLabelMarkerColor(): string {
    return this._labelMarkColor;
  }

  /**
   * Sets the color and alpha (opacity) of the preview mesh.
   *
   * @param color - The new color to apply to the preview mesh as a THREE.Color instance or a string (e.g., "#FF0000").
   * @param alpha - The new alpha (opacity) value to apply to the preview mesh (default is 0.25).
   */
  setPreviewColor(color: THREE.Color | string, alpha: number = 0.25): void {
    if (alpha < 0 || alpha > 1) {
      throw new Error("Alpha value must be between 0 and 1.");
    }
    if (typeof color === "string") {
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        throw new Error("Invalid color format. Must be a hex color string.");
      }
    }
    // Convert the color to a THREE.Color instance if it's a string
    const newColor = typeof color === "string" ? new THREE.Color(color) : color;

    // Update the color of the preview material
    const material = this.preview.material as THREE.MeshBasicMaterial;
    material.color = newColor;

    // Update the alpha (opacity) of the preview material
    material.opacity = alpha;
    material.transparent = alpha < 1.0; // Enable transparency if alpha is less than 1.0

    material.needsUpdate = true;
  }

  /**
   * Gets the current color of the preview mesh.
   *
   * @returns The current preview color as a THREE.Color instance.
   */
  getPreviewColor(): THREE.Color {
    const material = this.preview.material as THREE.MeshBasicMaterial;
    return material.color;
  }

  /**
   * Sets the color of the selected area.
   *
   * @param color - The new color to apply to the selected area as a THREE.Color instance or a string (e.g., "#FF0000").
   * @param alpha - The new alpha (opacity) value to apply to the selected area (default is 0.75).
   */
  setSelectionColor(color: THREE.Color | string, alpha: number = 0.75): void {
    if (alpha < 0 || alpha > 1) {
      throw new Error("Alpha value must be between 0 and 1.");
    }
    if (typeof color === "string") {
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        throw new Error("Invalid color format. Must be a hex color string.");
      }
    }
    // Convert the color to a THREE.Color instance if it's a string
    const newColor = typeof color === "string" ? new THREE.Color(color) : color;

    // Update the color and opacity of the selection material
    this.selectionMaterial.color = newColor;
    this.selectionMaterial.opacity = alpha;
    this.selectionMaterial.transparent = alpha < 1.0; // Enable transparency if alpha is less than 1.0
    this.selectionMaterial.needsUpdate = true;
  }

  /**
   * Gets the current color of the selected area.
   *
   * @returns The current selection color as a THREE.Color instance.
   */
  getSelectionColor(): THREE.Color {
    return this.selectionMaterial.color;
  }

  /**
   * Updates the information (area, perimeter, and label) for all items in the selection.
   */
  updateSelectionInfo(): void {
    if (!this.world) {
      throw new Error("World is required to update selection info!");
    }

    const utils = this.components.get(OBC.MeasurementUtils);

    for (const item of this.selection) {
      // Convert area and perimeter to the current units
      const convertedArea = utils.convertUnits(
        item.area,
        `${this.worldUnit}2` as convert.Area,
        this.units as convert.Area,
        this.rounding,
      );
      // Update the label
      item.label.three.element.textContent = `${convertedArea.toFixed(this.rounding)} ${this.units}`;
    }
  }

  /**
   * Sets the world unit for the face measurement.
   *
   * @param unit - The new world unit must be one of: "mm" | "cm" | "m" | "km" | "in" | "ft" | "yd" | "mi".
   */
  setWorldUnit(unit: string): void {
    const validUnits = ["mm", "cm", "m", "km", "in", "ft", "yd", "mi"];

    if (!validUnits.includes(unit)) {
      throw new Error(
        `Invalid unit: ${unit}. Must be one of ${validUnits.join(", ")}.`,
      );
    }

    this.worldUnit = unit as convert.Distance;

    this.updateSelectionInfo();
  }

  /**
   * Sets the display units for the face measurement.
   *
   * @param newUnit - The new display unit must be one of: "mm2" | "cm2" | "m2" | "km2" | "in2" | "ft2" | "mi2" | "ha" | "ac".
   */
  setUnit(newUnit: string): void {
    if (!this.world) {
      throw new Error("World is required to change units!");
    }
    const validUnits: string[] = [
      "mm2",
      "cm2",
      "m2",
      "ha",
      "km2",
      "in2",
      "ft2",
      "ac",
      "mi2",
    ];

    if (!validUnits.includes(newUnit)) {
      throw new Error(
        `Invalid unit: ${newUnit}. Must be one of ${validUnits.join(", ")}.`,
      );
    }

    this.units = newUnit as convert.Area;

    this.updateSelectionInfo();
  }

  /**
   * Sets the rounding precision for the face measurement.
   *
   * @param newRounding - The new rounding precision (e.g., 0, 1, 2, etc.).
   * @throws {Error} If the rounding value is not a valid integer or is out of range (0-5).
   */
  setRounding(newRounding: number): void {
    if (!Number.isInteger(newRounding) || newRounding < 0 || newRounding > 5) {
      throw new Error("Rounding must be an integer between 0 and 5.");
    }

    this.rounding = newRounding;

    // Update the selection info to reflect the new rounding precision
    this.updateSelectionInfo();
  }
}
