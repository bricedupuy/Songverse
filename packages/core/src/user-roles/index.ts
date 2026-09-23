import { INSTRUMENTS, TECH_ROLES, type InstrumentValue, type TechRoleValue } from "../constants/index.js";

/** The known values among `values`, deduplicated, in `list` order. */
function inListOrder<T extends string>(list: readonly T[], values: readonly string[]): T[] {
  const chosen = new Set(values);
  return list.filter((item) => chosen.has(item));
}

export function orderInstruments(values: readonly string[]): InstrumentValue[] {
  return inListOrder(INSTRUMENTS, values);
}

export function orderTechRoles(values: readonly string[]): TechRoleValue[] {
  return inListOrder(TECH_ROLES, values);
}
