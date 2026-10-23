import { Hono } from "hono";
import { asc, count, eq } from "drizzle-orm";
import { createDb } from "../db";
import { branches, megaCenters } from "../db/schema";

type Env = {
  Bindings: {
    DATABASE_URL: string;
  };
};

const branchesRouter = new Hono<Env>();

// GET /api/branches - every branch, A-Z. megaCenterCount > 0 means sign-up
// should also ask for a mega center (GET /api/mega-centers?branchId=...).
branchesRouter.get("/", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rows = await db
    .select({
      id: branches.id,
      name: branches.name,
      zoneId: branches.zoneId,
      megaCenterCount: count(megaCenters.id),
    })
    .from(branches)
    .leftJoin(megaCenters, eq(megaCenters.branchId, branches.id))
    .groupBy(branches.id)
    .orderBy(asc(branches.name));
  return c.json(rows, 200, {
    "Cache-Control": "public, max-age=3600",
  });
});

export default branchesRouter;
