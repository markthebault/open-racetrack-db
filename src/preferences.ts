export type Preferences = {
  saved: string[];
  lastTrack?: string;
  lastLayout?: string;
  view?: "2d" | "3d";
  height?: 1 | 3;
};
const key = "open-racetrack-atlas-v1";

export function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    return {
      saved: Array.isArray(value.saved)
        ? value.saved
            .filter((id: unknown): id is string => typeof id === "string")
            .slice(0, 1000)
        : [],
      lastTrack:
        typeof value.lastTrack === "string" ? value.lastTrack : undefined,
      lastLayout:
        typeof value.lastLayout === "string" ? value.lastLayout : undefined,
      view: value.view === "2d" || value.view === "3d" ? value.view : undefined,
      height:
        value.height === 1 || value.height === 3 ? value.height : undefined,
    };
  } catch {
    return { saved: [] };
  }
}

export function writePreferences(value: Preferences) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
