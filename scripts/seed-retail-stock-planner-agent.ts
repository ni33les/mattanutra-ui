import { closeSqlPool, getSql } from "@/lib/db";
import { seedRetailStockPlannerAgent } from "@/lib/retail-stock-planner-agent";

const sql = getSql();

if (!sql) {
  throw new Error("DB_URL is required to seed the Retail Stock Planner agent");
}

try {
  const result = await seedRetailStockPlannerAgent(sql);

  console.log(JSON.stringify(result, null, 2));
} finally {
  await closeSqlPool();
}
