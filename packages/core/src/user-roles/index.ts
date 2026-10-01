import { INSTRUMENTS, TECH_ROLES, type TechRoleValue } from "../constants/index.js";

/** The known values among `values`, deduplicated, in `list` order. */
function inListOrder<T extends string>(list: readonly T[], values: readonly string[]): T[] {
  const chosen = new Set(values);
  return list.filter((item) => chosen.has(item));
}

/**
 * Someone's instruments as shown: the built-in ones in the list's order,
 * then those an admin added (issue #166, their ids in `custom`'s order).
 * Any other value - one an admin removed since - is dropped.
 */
export function orderInstruments(values: readonly string[], custom: readonly string[] = []): string[] {
  return [...inListOrder(INSTRUMENTS, values), ...inListOrder(custom, values)];
}

export function orderTechRoles(values: readonly string[]): TechRoleValue[] {
  return inListOrder(TECH_ROLES, values);
}
