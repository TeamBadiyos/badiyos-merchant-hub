/** Minimal RFC4180-ish CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export const CSV_COLUMNS = [
  "name",
  "description",
  "category_label",
  "price",
  "stock_quantity",
  "unit",
] as const;

export const CSV_TEMPLATE = `${CSV_COLUMNS.join(",")}
Tur Dal 1kg,Premium unpolished tur dal,Groceries,148,25,kg
Amul Butter 500g,Salted butter,Dairy,275,12,piece
`;

export type ParsedRow = {
  index: number;
  name: string;
  description: string | null;
  category_label: string | null;
  price: number;
  stock_quantity: number;
  unit: string;
  errors: string[];
};

const UNITS = ["kg", "piece", "pack", "litre", "other"];

/** Map CSV rows onto product fields and collect per-row validation errors. */
export function mapRows(
  rows: string[][],
  labels: { name: string; price: string; stock: string },
): ParsedRow[] {
  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("name");
  const body = hasHeader ? rows.slice(1) : rows;
  const at = (cells: string[], col: (typeof CSV_COLUMNS)[number], fallback: number) => {
    const idx = hasHeader ? header.indexOf(col) : fallback;
    return idx >= 0 ? (cells[idx] ?? "").trim() : "";
  };

  return body.map((cells, i) => {
    const name = at(cells, "name", 0);
    const priceRaw = at(cells, "price", 3);
    const stockRaw = at(cells, "stock_quantity", 4) || "0";
    const unitRaw = (at(cells, "unit", 5) || "piece").toLowerCase();
    const price = Number(priceRaw);
    const stock = Number(stockRaw);
    const errors: string[] = [];
    if (!name) errors.push(labels.name);
    if (!priceRaw || !Number.isFinite(price) || price <= 0) errors.push(labels.price);
    if (!Number.isInteger(stock) || stock < 0) errors.push(labels.stock);
    return {
      index: i + 1,
      name,
      description: at(cells, "description", 1) || null,
      category_label: at(cells, "category_label", 2) || null,
      price,
      stock_quantity: Number.isInteger(stock) && stock >= 0 ? stock : 0,
      unit: UNITS.includes(unitRaw) ? unitRaw : "other",
      errors,
    };
  });
}
