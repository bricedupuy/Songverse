/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields (with "" as an
 * escaped quote), commas and newlines inside quoted fields, and both \r\n
 * and \n line endings. Good enough for admin-authored catalog CSVs without
 * pulling in a dependency for it.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\r") {
      // Skip - the following \n (if any) drives the row break.
    } else if (char === "\n") {
      pushRow();
    } else {
      field += char;
    }
  }

  // Final field/row, if the text didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/** Parses a CSV with a header row into objects keyed by (trimmed) header name. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) return [];
  const dataRows = rows.slice(1);
  const keys = header.map((h) => h.trim());
  return dataRows.map((row) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = (row[index] ?? "").trim();
    });
    return record;
  });
}
