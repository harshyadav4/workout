/**
 * Turn the IFCT 2017 table into public/foods.json — the diet twin of
 * public/exercises.json.
 *
 *   npm run foods -- /path/to/index.csv
 *
 * The CSV is `index.csv` from github.com/ifct2017/compositions (MIT-packaged;
 * the values themselves are the Indian Food Composition Tables 2017, National
 * Institute of Nutrition, Hyderabad). It is not a dependency: fetch it once,
 * run this, commit the JSON. Every value is per 100 g of the raw food; energy
 * arrives in kJ and leaves in kcal, because that is the number people know.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface FoodRow {
  id: string;
  name: string;
  group: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micros: Record<string, number>;
}

/**
 * Micronutrients: the app's name, the table's column, and what to multiply by.
 * The table stores every one in grams per 100 g, so 0.00065 for iron is 0.65 mg.
 */
const MICROS: [string, string, number][] = [
  ["ironMg", "fe", 1000],
  ["calciumMg", "ca", 1000],
  ["magnesiumMg", "mg", 1000],
  ["zincMg", "zn", 1000],
  ["potassiumMg", "k", 1000],
  ["sodiumMg", "na", 1000],
  ["vitaminCMg", "vitc", 1000],
  ["folateUg", "folsum", 1_000_000],
  ["thiamineMg", "thia", 1000],
  ["riboflavinMg", "ribf", 1000],
  ["fiberG", "fibtg", 1]
];

/**
 * Two columns cannot be taken as they stand, because they would mislead.
 *
 * Vitamin A: the table's `vita` adds retinol and plant carotene one for one, which
 * made spinach look like 2,605 µg. The body converts dietary β-carotene at about
 * 12:1 (Institute of Medicine, 2001), so it is retinol + β-carotene equivalents ÷ 12.
 *
 * Vitamin D: the table lists D2 in foods that other tables put at about zero. Cereals
 * average 13 µg per 100 g and wheat flour has 13 µg, so ordinary roti would "meet"
 * the target in a country where low vitamin D is common. D3 from animal foods looks
 * right, and mushrooms really do carry D2, so those two are what count.
 */
const BETA_CAROTENE_TO_RETINOL = 12;
const D2_COUNTS_IN = "Mushrooms";

/** Three significant figures: the table is not more exact than that, and the file stays small. */
function sig(value: number): number {
  return value === 0 ? 0 : Number(value.toPrecision(3));
}

const KJ_PER_KCAL = 4.184;
/**
 * The table gives no energy or macros for pure fats (oils, ghee, vanaspati) —
 * only their fatty-acid profile. A fat is ~100 g fat per 100 g at 9 kcal/g,
 * so those rows get that instead of being dropped, because ghee is in half of
 * Indian cooking.
 */
const PURE_FAT_GROUP = "Edible Oils and Fats";
const KCAL_PER_G_FAT = 9;

/** A small RFC 4180 reader: quoted fields, doubled quotes, commas inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

/** Column headers read "Energy; enerc" — the short key after the semicolon is the stable one. */
function keyOf(header: string): string {
  const parts = header.split(";");
  return (parts[1] ?? parts[0]).trim();
}

function num(value: string | undefined): number {
  const parsed = Number((value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("usage: npm run foods -- <path to IFCT index.csv>");
    process.exit(1);
  }
  const [header, ...rows] = parseCsv(readFileSync(resolve(input), "utf8"));
  const column = new Map(header.map((label, index) => [keyOf(label), index]));
  const need = ["code", "name", "grup", "enerc", "protcnt", "choavldf", "fatce", "retol", "cartbeq", "chocal", "ergcal", ...MICROS.map(([, column]) => column)];
  const missing = need.filter((key) => !column.has(key));
  if (missing.length > 0) {
    console.error(`missing columns: ${missing.join(", ")}`);
    process.exit(1);
  }
  const cell = (row: string[], key: string) => row[column.get(key) as number];

  const foods: FoodRow[] = rows
    .map((row): FoodRow => {
      const group = cell(row, "grup").trim();
      const food: FoodRow = {
        id: cell(row, "code").trim(),
        name: cell(row, "name").trim(),
        group,
        kcal: Math.round(num(cell(row, "enerc")) / KJ_PER_KCAL),
        proteinG: round(num(cell(row, "protcnt")), 1),
        carbsG: round(num(cell(row, "choavldf")), 1),
        fatG: round(num(cell(row, "fatce")), 1),
        micros: {
          ...Object.fromEntries(MICROS.map(([key, column, scale]) => [key, sig(num(cell(row, column)) * scale)])),
          vitaminAUg: sig((num(cell(row, "retol")) + num(cell(row, "cartbeq")) / BETA_CAROTENE_TO_RETINOL) * 1_000_000),
          vitaminDUg: sig((num(cell(row, "chocal")) + (group === D2_COUNTS_IN ? num(cell(row, "ergcal")) : 0)) * 1_000_000)
        }
      };
      if (group === PURE_FAT_GROUP && food.kcal === 0) {
        return { ...food, fatG: 100, kcal: 100 * KCAL_PER_G_FAT };
      }
      return food;
    })
    .filter((food) => food.id && food.name && food.kcal > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const out = resolve(process.cwd(), "public/foods.json");
  writeFileSync(out, JSON.stringify(foods));
  console.log(`${foods.length} foods → ${out}`);
}

main();
