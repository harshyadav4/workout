import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { muscles, presetWorkouts, starterPlanner } from "@/lib/seed-data";

const output = resolve(process.cwd(), "public/seed-data.json");

writeFileSync(
  output,
  JSON.stringify(
    {
      muscles,
      presetWorkouts,
      starterPlanner
    },
    null,
    2
  )
);

console.log(`Seed data exported to ${output}`);
