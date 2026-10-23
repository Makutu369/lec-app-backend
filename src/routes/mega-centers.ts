import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { createDb } from "../db";
import { megaCenters } from "../db/schema";

type Env = {
  Bindings: {
    DATABASE_URL: string;
  };
};

const megaCentersRouter = new Hono<Env>();

// GET /api/mega-centers[?branchId=...] - all mega centers, or one branch's.
megaCentersRouter.get("/", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const branchId = c.req.query("branchId");
  const allCenters = branchId
    ? await db.select().from(megaCenters).where(eq(megaCenters.branchId, branchId))
    : await db.select().from(megaCenters);
  return c.json(allCenters, 200, {
    "Cache-Control": "public, max-age=3600",
  });
});

export default megaCentersRouter;
