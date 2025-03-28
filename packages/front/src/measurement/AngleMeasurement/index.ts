import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { AngleMeasureElement } from "./src";
import { GraphicVertexPicker } from "../../utils";
import convert from "convert-units"; // Import the convert-units module

// TODO: Make appearance customizable?

/**
 * This component allows users to measure angles in a 3D scene. 📕 [Tutorial](https://docs.thatopen.com/Tutorials/Components/Front/AngleMeasurement). 📘 [API](https://docs.thatopen.com/api/@thatopen/components-front/classes/AngleMeasurement).
 */
export class AngleMeasurement
  extends OBC.Component
  implements OBC.Createable, OBC.Disposable
{
  /**
   * A unique identifier for the component.
   * This UUID is used to register the component within the Components system.
   */
  static readonly uuid = "622fb2c9-528c-4b0a-8a0e-6a1375f0a3aa" as const;

  /** {@link OBC.Disposable.onDisposed} */
  readonly onDisposed = new OBC.Event();

  /**
   * The world in which the angle measurements are performed.
   * This property is optional and can be set to null if no world is available.
   */
  world?: OBC.World;

  /**
   * A list of all the angle measurement elements created by this component.
   */
  list: AngleMeasureElement[] = [];

  private _lineMaterial: LineMaterial;

  private _enabled = false;

  private _vertexPicker: GraphicVertexPicker;

  private _currentAngleElement: AngleMeasureElement | null = null;

  private _clickCount: number = 0;

  /**
   * The current unit for angle measurement (e.g., "deg", "rad").
   */
  private units: "deg" | "rad" | "grad" | "arcmin" | "arcsec" = "deg";
  private rounding: 0 | 1 | 2 | 3 | 4 | 5 = 2;

  /** {@link OBC.Component.enabled} */
  get enabled() {
    return this._enabled;
  }

  /** {@link OBC.Component.enabled} */
  set enabled(value: boolean) {
    this._enabled = value;
    this.setupEvents(value);
    this._vertexPicker.enabled = value;
    if (!value) {
      this.cancelCreation();
    }
  }

  /**
   * Getter for the line material used for the angle measurement lines.
   */
  get lineMaterial() {
    return this._lineMaterial;
  }

  /**
   * Setter for the line material used for the angle measurement lines.
   * Disposes the old material and sets the new one.
   * Also updates the resolution of the material to match the window size.
   * @param material - The new line material to use.
   */
  set lineMaterial(material: LineMaterial) {
    this._lineMaterial.dispose();
    this._lineMaterial = material;
    this._lineMaterial.resolution.set(window.innerWidth, window.innerHeight);
  }

  /**
   * Getter for the working plane for the angle measurement.
   * @returns The current working plane or null if no plane is being used.
   */
  get workingPlane() {
    return this._vertexPicker.workingPlane;
  }

  /**
   * Setter for the working plane for the angle measurement.
   * Sets the working plane for the vertex picker.
   * @param plane - The new working plane or null if no plane is to be used.
   */
  set workingPlane(plane: THREE.Plane | null) {
    this._vertexPicker.workingPlane = plane;
  }

  constructor(components: OBC.Components) {
    super(components);
    this.components.add(AngleMeasurement.uuid, this);
    this._vertexPicker = new GraphicVertexPicker(components);
    this._lineMaterial = new LineMaterial({
      depthTest: false,
      // color: 0x6528d7,
      color: 0x0000ff,
      transparent: true,
      opacity: 0.8,
      linewidth: 2,
    });
  }

  /** {@link OBC.Disposable.dispose} */
  dispose() {
    this.setupEvents(false);
    this._lineMaterial.dispose();
    this._vertexPicker.dispose();
    for (const measure of this.list) {
      measure.dispose();
    }
    if (this._currentAngleElement) {
      this._currentAngleElement.dispose();
    }
    (this.components as any) = null;
    this.onDisposed.trigger(AngleMeasurement.uuid);
    this.onDisposed.reset();
  }

  /** {@link OBC.Createable.create} */
  create = () => {
    if (!this.enabled) return;
    if (!this.world) {
      console.log("No world selected for angle measurement!");
      return;
    }
    const point = this._vertexPicker.get(this.world);
    if (!point) {
      return;
    }
    if (!this._currentAngleElement) {
      const angleElement = new AngleMeasureElement(this.world);
      angleElement.lineMaterial = this.lineMaterial;
      angleElement.units = this.units;
      angleElement.rounding = this.rounding;

      // angleElement.onPointRemoved.on(() => this._clickCount--);
      this._currentAngleElement = angleElement;
    }
    // call before setPoint
    this._currentAngleElement.onSetNewPoint.trigger({
      index: this._clickCount,
      point,
    });
    this._currentAngleElement.setPoint(point, this._clickCount as 0 | 1 | 2);
    this._clickCount++;
    if (this._clickCount === 3) this.endCreation();
  };

  // TODO: Implement this
  /** {@link OBC.Createable.delete} */
  delete() {}

  /** Deletes all the dimensions that have been previously created. */
  deleteAll() {
    for (const dim of this.list) {
      dim.dispose();
    }
    this.list = [];
  }

  /** {@link OBC.Createable.endCreation} */
  endCreation() {
    if (this._currentAngleElement) {
      this.list.push(this._currentAngleElement);
      this._currentAngleElement.computeAngle();
      this._currentAngleElement = null;
    }
    this._clickCount = 0;
  }

  /** {@link OBC.Createable.cancelCreation} */
  cancelCreation() {
    if (this._currentAngleElement) {
      this._currentAngleElement.dispose();
      this._currentAngleElement = null;
    }
    this._clickCount = 0;
  }

  private setupEvents(active: boolean) {
    if (!this.world) {
      throw new Error("No world selected for angle measurement!");
    }

    if (this.world.isDisposing) {
      return;
    }

    if (!this.world.renderer) {
      throw new Error("The given world doesn't have a renderer!");
    }
    const canvas = this.world.renderer.three.domElement;
    const viewerContainer = canvas.parentElement as HTMLElement;
    if (active) {
      viewerContainer.addEventListener("pointermove", this.onMouseMove);
      window.addEventListener("keydown", this.onKeyDown);
    } else {
      viewerContainer.removeEventListener("pointermove", this.onMouseMove);
      window.removeEventListener("keydown", this.onKeyDown);
    }
  }

  private onMouseMove = () => {
    if (!this.world) {
      console.log("No world selected for angle measurement!");
      return;
    }
    const point = this._vertexPicker.get(this.world);
    if (!(point && this._currentAngleElement)) return;
    this._currentAngleElement.setPoint(point, this._clickCount as 0 | 1 | 2);
    this._currentAngleElement.computeAngle();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (e.key === "Escape") {
      this.cancelCreation();
    }
  };

  /**
   * Sets the color of the line material used for angle measurement.
   *
   * @param color - The new color to apply to the line material as a THREE.Color instance or a string (e.g., "#FF0000").
   * @throws {Error} If the color is not a valid hex string or a THREE.Color instance.
   */
  setLineMaterialColor(color: THREE.Color | string): void {
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

    // Update the line material's color
    this._lineMaterial.color = newColor;
    this._lineMaterial.needsUpdate = true; // Ensure the material updates in the scene

    // Update the material for all items in the list
    for (const angleElement of this.list) {
      angleElement.lineMaterial = this._lineMaterial;
    }
  }

  /**
   * Gets the current color of the line material used for angle measurement.
   *
   * @returns The current color of the line material as a THREE.Color instance.
   */
  getLineMaterialColor(): THREE.Color {
    return this._lineMaterial.color;
  }

  /**
   * Sets the display units for the angle measurement.
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

    // Update the units for AreaMeasurement
    this.list.forEach((dimension) => {
      dimension.setUnit(this.units);
    });

    if (this._currentAngleElement) {
      this._currentAngleElement.setUnit(this.units);
    }
  }

  /**
   * Gets the current display unit for the angle measurement.
   *
   * @returns The current display unit as a string ("deg" | "rad" | "grad" | "arcmin" | "arcsec").
   */
  getUnit(): "deg" | "rad" | "grad" | "arcmin" | "arcsec" {
    return this.units;
  }

  /**
   * Sets the rounding precision for angle measurements.
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

    // Update the rounding for all angle measurement elements
    this.list.forEach((angleElement) => {
      angleElement.setRounding(rounding);
    });

    if (this._currentAngleElement) {
      this._currentAngleElement.setRounding(rounding);
    }
  }
}
