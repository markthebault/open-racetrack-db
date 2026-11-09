/** Fixed illustrative dry-condition preset; parameters are assumptions, not telemetry. */
export const IDEAL_CAR = {
  widthM: 2.05,
  massKg: 1350,
  powerKw: 410,
  topSpeedKph: 285,
  mechanicalG: 1.55,
  aeroGAt200: 0.85,
  maxLateralG: 3,
  brakingG: 1.8,
  maxBrakingG: 2.8,
  driveG: 0.85,
  dragArea: 1.1,
};
export type CarProfile = typeof IDEAL_CAR;
export const G = 9.80665;
export function lateralLimit(v: number, car: CarProfile) {
  return Math.min(
    car.maxLateralG,
    car.mechanicalG + car.aeroGAt200 * (v / (200 / 3.6)) ** 2,
  );
}
