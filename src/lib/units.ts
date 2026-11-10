// Storage is always metric. These helpers convert for display/input only.

export type UnitSystem = "METRIC" | "IMPERIAL";

const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;
const M_PER_MI = 1609.344;

export const kgToLb = (kg: number) => kg * LB_PER_KG;
export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;

export function round(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function weightUnit(units: UnitSystem): "kg" | "lb" {
  return units === "IMPERIAL" ? "lb" : "kg";
}

/** Stored kg → number in the user's unit. */
export function displayWeight(kg: number, units: UnitSystem, decimals = 1): number {
  return round(units === "IMPERIAL" ? kgToLb(kg) : kg, decimals);
}

/** Number entered in the user's unit → kg for storage. */
export function inputWeightToKg(value: number, units: UnitSystem): number {
  return units === "IMPERIAL" ? lbToKg(value) : value;
}

export function formatWeight(kg: number, units: UnitSystem, decimals = 1): string {
  return `${displayWeight(kg, units, decimals)} ${weightUnit(units)}`;
}

export function distanceUnit(units: UnitSystem): "km" | "mi" {
  return units === "IMPERIAL" ? "mi" : "km";
}

/** Stored metres → km or miles. */
export function displayDistance(m: number, units: UnitSystem, decimals = 2): number {
  return round(m / (units === "IMPERIAL" ? M_PER_MI : 1000), decimals);
}

/** Km or miles entered → metres for storage. */
export function inputDistanceToM(value: number, units: UnitSystem): number {
  return value * (units === "IMPERIAL" ? M_PER_MI : 1000);
}

export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === "METRIC") return `${round(cm)} cm`;
  const totalIn = Math.round(cmToIn(cm));
  return `${Math.floor(totalIn / 12)}′${totalIn % 12}″`;
}
