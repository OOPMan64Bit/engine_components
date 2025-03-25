import * as THREE from "three";
import * as OBC from "@thatopen/components";
import { AreaMeasureElement } from "./src";
import { GraphicVertexPicker } from "../../utils";
import convert from "convert-units";

/**
 * This component allows users to measure areas in a 3D scene. 📕 [Tutorial](https://docs.thatopen.com/Tutorials/Components/Front/AreaMeasurement). 📘 [API](https://docs.thatopen.com/api/@thatopen/components-front/classes/AreaMeasurement).
 */
export class AreaMeasurement
  extends OBC.Component
  implements OBC.Createable, OBC.Disposable, OBC.Hideable
{
  /**
   * A unique identifier for the component.
   * This UUID is used to register the component within the Components system.
   */
  static readonly uuid = "c453a99e-f054-4781-9060-33df617db4a5" as const;

  /** {@link OBC.Disposable.onDisposed} */
  readonly onDisposed = new OBC.Event();

  /**
   * A list of all the area measurement elements created by this component.
   */
  list: AreaMeasureElement[] = [];

  /**
   * The world in which the area measurements are performed.
   * This property is optional and can be set to null if no world is available.
   */
  world?: OBC.World;

  private _enabled = false;

  private _visible = true;

  private _vertexPicker: GraphicVertexPicker;

  private _currentAreaElement: AreaMeasureElement | null = null;

  private _clickCount: number = 0;

  /**
   * The rounding precision for area measurement.
   * Determines the number of decimal places to display.
   */
  private rounding: number = 2; // Default rounding precision

  /**
   * The display units for area measurement.
   * Determines the unit of measurement (e.g., "m", "cm", "mm").
   */
  private units: convert.Area = "m2"; // Default display unit

  /**
   * The unit of the input data (current world unit).
   */
  private worldUnit: convert.Distance = "m"; // Default to meters

  // Add a property to store the normal color
  private _normalColor: THREE.Color = new THREE.Color("#0000FF"); // Default normal color

  /** {@link OBC.Component.enabled} */
  set enabled(value: boolean) {
    this._enabled = value;
    this._vertexPicker.enabled = value;
    this.setupEvents(value);
    if (!value) {
      this.cancelCreation();
    }
  }

  /** {@link OBC.Component.enabled} */
  get enabled() {
    return this._enabled;
  }

  /**
   * Setter for the working plane for the area measurement.
   * Sets the working plane for the vertex picker.
   * @param plane - The new working plane or null if no plane is to be used.
   */
  set workingPlane(plane: THREE.Plane | null) {
    this._vertexPicker.workingPlane = plane;
  }

  /**
   * Getter for the working plane for the area measurement.
   * @returns The current working plane or null if no plane is being used.
   */
  get workingPlane() {
    return this._vertexPicker.workingPlane;
  }

  /** {@link OBC.Hideable.visible} */
  get visible() {
    return this._visible;
  }

  /** {@link OBC.Hideable.visible} */
  set visible(value: boolean) {
    this._visible = value;
    for (const dim of this.list) {
      dim.visible = value;
    }
  }

  constructor(components: OBC.Components) {
    super(components);
    this.components.add(AreaMeasurement.uuid, this);
    this._vertexPicker = new GraphicVertexPicker(components);
  }

  /** {@link OBC.Disposable.dispose} */
  dispose() {
    this.setupEvents(false);

    this._vertexPicker.dispose();
    if (this._currentAreaElement) {
      this._currentAreaElement.dispose();
    }
    for (const measure of this.list) {
      measure.dispose();
    }
    (this.components as any) = null;
    this.onDisposed.trigger(AreaMeasurement.uuid);
    this.onDisposed.reset();
  }

  /** {@link OBC.Createable.create} */
  create = () => {
    if (!this.enabled) return;
    if (!this.world) {
      throw new Error("World not defined for the area measurement!");
    }

    const point = this._vertexPicker.get(this.world);

    if (!point) {
      return;
    }
    if (!this._currentAreaElement) {
      const areaShape = new AreaMeasureElement(
        this.components,
        this.world,
        this._normalColor,
        this.worldUnit,
        this.units,
        this.rounding,
      );
      areaShape.onPointAdded.add(() => {
        if (this._clickCount === 2 && !areaShape.workingPlane) {
          areaShape.computeWorkingPlane();
          this._vertexPicker.workingPlane = areaShape.workingPlane;
        }
      });
      areaShape.onPointRemoved.add(() => this._clickCount--);
      this._currentAreaElement = areaShape;
    }

    this._currentAreaElement.setPoint(point, this._clickCount);
    this._currentAreaElement.computeArea();
    this._clickCount++;
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
    if (!this._currentAreaElement) {
      return;
    }
    if (this._currentAreaElement.points.length < 3) {
      return;
    }
    if (this._currentAreaElement) {
      this.list.push(this._currentAreaElement);
      this._currentAreaElement.removePoint(this._clickCount);
      this._currentAreaElement.computeWorkingPlane();
      this._currentAreaElement.computeArea();
      this._currentAreaElement = null;
    }
    this._vertexPicker.workingPlane = null;
    this._clickCount = 0;
  }

  /** {@link OBC.Createable.cancelCreation} */
  cancelCreation() {
    if (this._currentAreaElement) {
      this._currentAreaElement.dispose();
      this._currentAreaElement = null;
    }
    this._vertexPicker.workingPlane = null;
    this._clickCount = 0;
  }

  private setupEvents(active: boolean) {
    if (!this.world) {
      throw new Error("The area measurement needs a world to work!");
    }

    if (this.world.isDisposing) {
      return;
    }

    if (!this.world.renderer) {
      throw new Error("The world of the area measurement needs a renderer!");
    }
    const canvas = this.world.renderer.three.domElement;
    const viewerContainer = canvas.parentElement as HTMLElement;
    if (active) {
      viewerContainer.addEventListener("pointermove", this.onMouseMove);
      window.addEventListener("keydown", this.onKeydown);
    } else {
      viewerContainer.removeEventListener("pointermove", this.onMouseMove);
      window.removeEventListener("keydown", this.onKeydown);
    }
  }

  private onMouseMove = () => {
    if (!this.world) {
      console.log("No world given for the area measurement!");
      return;
    }
    const point = this._vertexPicker.get(this.world);
    if (!(point && this._currentAreaElement)) {
      return;
    }
    this._currentAreaElement.setPoint(point, this._clickCount);
    this._currentAreaElement.computeArea();
  };

  private onKeydown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (e.key === "z" && e.ctrlKey && this._currentAreaElement)
      this._currentAreaElement.removePoint(this._clickCount - 1);
    if (e.key === "Enter" && this._currentAreaElement) this.endCreation();
    if (e.key === "Escape") {
      if (this._clickCount === 0 && !this._currentAreaElement) {
        this.enabled = false;
      } else {
        this.cancelCreation();
      }
    }
  };

  /**
   * Sets the color of all AreaMeasureElement instances, including the current one.
   *
   * @param color - The new color to apply to all AreaMeasureElement instances as a THREE.Color instance or a string (e.g., "#FF0000").
   */
  setColors(color: THREE.Color | string): void {
    if (typeof color === "string") {
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        throw new Error("Invalid color format. Must be a hex color string.");
      }
    }

    // Convert the color to a THREE.Color instance if it's a string
    const newColor = typeof color === "string" ? new THREE.Color(color) : color;

    // Save the color as the normal color
    this._normalColor = newColor;

    // Update the color of all AreaMeasureElement instances in the list
    for (const areaElement of this.list) {
      areaElement.setColors(newColor);
    }

    // Update the color of the current AreaMeasureElement, if it exists
    if (this._currentAreaElement) {
      this._currentAreaElement.setColors(newColor);
    }
  }

  /**
   * Gets the current normal color of the AreaMeasurement.
   *
   * @returns The current normal color as a THREE.Color instance.
   */
  getColor(): THREE.Color {
    return this._normalColor;
  }

  /**
   * Changes the world unit for AreaMeasurement.
   *
   * @param newUnit - The new world unit must be one of: "mm" | "cm" | "m" | "km" | "in" | "ft" | "yd" | "mi".
   */
  setWorldUnit(newUnit: string = "m"): void {
    if (!this.world) {
      throw new Error("World is required to change units!");
    }

    const validUnits: string[] = [
      "mm",
      "cm",
      "m",
      "km",
      "in",
      "ft",
      "yd",
      "mi",
    ];

    if (!validUnits.includes(newUnit)) {
      throw new Error(
        `Invalid unit: ${newUnit}. Must be one of ${validUnits.join(", ")}.`,
      );
    }

    this.worldUnit = newUnit as convert.Distance;

    // Update the units for AreaMeasurement
    this.list.forEach((dimension) => {
      dimension.setWorldUnit(newUnit as convert.Distance);
    });

    if (this._currentAreaElement) {
      this._currentAreaElement.setWorldUnit(newUnit as convert.Distance);
    }
  }

  /**
   * Gets the current world unit for AreaMeasurement.
   *
   * @returns The current world unit as a string (e.g., "mm", "cm", "m", "km", etc.).
   */
  getWorldUnit(): string {
    return this.worldUnit;
  }

  /**
   * Sets the display units for AreaMeasurement.
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

    // Update the units for all AreaMeasureElement
    this.list.forEach((dimension) => {
      dimension.setUnit(newUnit as convert.Area);
    });

    if (this._currentAreaElement) {
      this._currentAreaElement.setUnit(newUnit as convert.Area);
    }
  }

  /**
   * Gets the current display units for AreaMeasurement.
   *
   * @returns The current display units as a string (e.g., "mm2", "cm2", "m2", "km2", etc.).
   */
  getUnit(): string {
    return this.units;
  }

  /**
   * Sets the rounding precision for AreaMeasurement.
   *
   * @param newRounding - The new rounding precision (e.g., 0, 1, 2, etc.).
   * @throws {Error} If the rounding value is not a valid integer or is out of range (0-5).
   */
  setRounding(newRounding: number): void {
    if (!this.world) {
      throw new Error("World is required to change units!");
    }
    if (!Number.isInteger(newRounding) || newRounding < 0 || newRounding > 5) {
      throw new Error("Rounding must be an integer between 0 and 5.");
    }

    this.rounding = newRounding;

    // Update the rounding for all AreaMeasureElement instances
    this.list.forEach((dimension) => {
      dimension.setRounding(newRounding);
    });

    if (this._currentAreaElement) {
      this._currentAreaElement.setRounding(newRounding);
    }
  }

  /**
   * Gets the current rounding precision for AreaMeasurement.
   *
   * @returns The current rounding precision as a number.
   */
  getRounding(): number {
    return this.rounding;
  }
}
