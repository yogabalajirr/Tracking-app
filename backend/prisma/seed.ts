import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

function parseCsvLine(line: string): string[] {
  // Simple CSV parsing assuming no commas inside fields
  return line.split(",").map((s) => s.trim());
}

async function seedFromCsv() {
  const csvPath = path.resolve(process.cwd(), "../indian_dishes_macros_expanded.csv");
  if (!fs.existsSync(csvPath)) {
    console.warn("CSV not found at", csvPath, "- skipping CSV seed.");
    return 0;
  }
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 6) continue;
    const name = cols[0];
    const serving = cols[1];
    const calories = parseInt(cols[2] || "0", 10) || 0;
    const protein = parseInt(cols[3] || "0", 10) || 0;
    const carbs = parseInt(cols[4] || "0", 10) || 0;
    const fat = parseInt(cols[5] || "0", 10) || 0;
    const fullName = `${name} (${serving})`;
    await prisma.food.upsert({
      where: { name: fullName },
      update: { calories, protein, carbs, fat },
      create: { name: fullName, calories, protein, carbs, fat },
    });
    count++;
  }
  console.log(`Seeded ${count} foods from CSV`);
  return count;
}

async function main() {
  await seedFromCsv();
}

main().finally(async () => {
  await prisma.$disconnect();
});


