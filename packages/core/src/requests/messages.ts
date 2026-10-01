import "../zod-config.js";
import type { z } from "zod";

/**
 * How the API words a request's problems (issue #118): one message per
 * problem, as class-validator did ("year must not be less than 1000"), so
 * clients and their messages carry on as before. A message a schema sets
 * itself ("A song needs at least one artist") is used as it is. Here, not
 * in the API, so every client checks a form the same way (issue #170).
 */

const field = (path: PropertyKey[]) => path.map(String).join(".") || "value";

const TYPE_NAMES: Record<string, string> = {
  string: "a string",
  number: "a number",
  int: "an integer number",
  boolean: "a boolean value",
  array: "an array",
  object: "an object",
};

const FORMAT_NAMES: Record<string, string> = {
  url: "a URL address",
  email: "an email",
  uuid: "a UUID",
  guid: "a UUID",
  datetime: "a valid ISO 8601 date string",
  date: "a valid ISO 8601 date string",
};

type Issue = z.core.$ZodRawIssue;

export function describeRequestIssue(issue: Issue): string | undefined {
  const name = field(issue.path ?? []);
  switch (issue.code) {
    case "invalid_type":
      return `${name} must be ${TYPE_NAMES[issue.expected] ?? issue.expected}`;
    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string") return min <= 1 ? `${name} should not be empty` : `${name} must be longer than or equal to ${min} characters`;
      if (issue.origin === "array" || issue.origin === "set") return `${name} must contain at least ${min} elements`;
      return `${name} must not be less than ${min}`;
    }
    case "too_big": {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return `${name} must be shorter than or equal to ${max} characters`;
      if (issue.origin === "array" || issue.origin === "set") return `${name} must contain no more than ${max} elements`;
      return `${name} must not be greater than ${max}`;
    }
    case "invalid_value":
      return `${name} must be one of the following values: ${issue.values.map(String).join(", ")}`;
    case "invalid_format":
      if (issue.format === "regex" && "pattern" in issue) return `${name} must match ${String(issue.pattern)} regular expression`;
      return `${name} must be ${FORMAT_NAMES[issue.format] ?? `a valid ${issue.format}`}`;
    case "custom": {
      // A refine that names what it checks ({ params: { format: "url" } }).
      const format = (issue.params as { format?: string } | undefined)?.format;
      return format ? `${name} must be ${FORMAT_NAMES[format] ?? `a valid ${format}`}` : undefined;
    }
    case "unrecognized_keys":
      return issue.keys.map((key) => `property ${[...(issue.path ?? []), key].map(String).join(".")} should not exist`).join("; ");
    default:
      return undefined;
  }
}

/**
 * A request checked as the API checks it: the body it goes on with
 * (defaults filled in, text trimmed), or its messages - "property a should
 * not exist; property b should not exist" being one problem, two messages.
 */
export function checkRequest<T extends z.ZodType>(schema: T, body: unknown): { ok: true; value: z.output<T> } | { ok: false; messages: string[] } {
  const parsed = schema.safeParse(body, { error: (issue) => describeRequestIssue(issue) });
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, messages: parsed.error.issues.flatMap((issue) => issue.message.split("; ")) };
}
