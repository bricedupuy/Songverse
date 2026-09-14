/** Narrows an Express route param (string | string[] | undefined) to a single string. */
export function stringParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
