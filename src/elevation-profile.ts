import type { courseElevation } from "./elevation";

export function elevationProfile(
  profile: NonNullable<ReturnType<typeof courseElevation>>,
  network: boolean,
) {
  const section = document.createElement("section");
  section.className = "elevation-panel";
  section.setAttribute("aria-label", "Estimated terrain elevation");
  const heading = document.createElement("div");
  heading.className = "elevation-heading";
  const title = document.createElement("span");
  title.textContent = "Terrain elevation";
  const change = document.createElement("strong");
  change.id = "elevation-range";
  change.textContent = `${Math.round(profile.max - profile.min)} m relief`;
  heading.append(title, change);
  const chart = document.createElement("div");
  chart.className = "elevation-chart";
  const labels = document.createElement("div");
  labels.className = "elevation-labels";
  for (const value of [profile.max, profile.min]) {
    const label = document.createElement("span");
    label.textContent = `${Math.round(value)} m`;
    labels.append(label);
  }
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.id = "elevation-profile";
  svg.setAttribute("viewBox", "0 0 640 56");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Estimated terrain elevation from ${Math.round(profile.min)} to ${Math.round(profile.max)} metres. ${network ? "Network branches are shown separately." : "Profile follows the mapped trace."}`,
  );
  const longest = Math.max(
    ...profile.paths.map((path) => path.at(-1)!.distance),
    1,
  );
  const range = Math.max(profile.max - profile.min, 1);
  for (const path of profile.paths) {
    // Every branch starts a separate SVG path; gaps in a network stay gaps.
    const points = path.map((point) => [
      (point.distance / longest) * 640,
      48 - ((point.elevation! - profile.min) / range) * 40,
    ]);
    const d = points
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`)
      .join("");
    const fill = document.createElementNS(ns, "path");
    fill.setAttribute("d", `${d}L${points.at(-1)![0].toFixed(2)},56L0,56Z`);
    fill.setAttribute("class", "elevation-fill");
    const line = document.createElementNS(ns, "path");
    line.setAttribute("d", d);
    line.setAttribute("class", "elevation-line");
    svg.append(fill, line);
  }
  chart.append(labels, svg);
  const note = document.createElement("span");
  note.className = "elevation-caption";
  note.textContent = network
    ? "Terrain estimate · separate branches"
    : "Terrain estimate · along the mapped trace";
  section.append(heading, chart, note);
  return section;
}
