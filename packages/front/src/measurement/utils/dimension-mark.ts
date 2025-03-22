export function newDimensionMark() {
  const mark = document.createElement("div");
  mark.style.backgroundColor = "blue";
  mark.style.color = "white";
  mark.style.padding = "6px";
  mark.style.borderRadius = "6px";
  mark.style.fontFamily = "Sora";
  mark.style.boxShadow = "0px 4px 6px rgba(0, 0, 0, 0.6)"; // Add box shadow effect
  mark.style.zIndex = "-10";

  return mark;
}

export function newEndPoint() {
  const mark = document.createElement("div");
  mark.style.backgroundColor = "white";
  mark.style.color = "white";
  mark.style.height = "7px";
  mark.style.width = "7px";
  mark.style.borderRadius = "50%";
  mark.style.border = "2px solid blue";
  mark.style.fontFamily = "Sora";
  mark.style.zIndex = "-20";

  return mark;
}
