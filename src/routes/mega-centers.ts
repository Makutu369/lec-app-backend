import { Hono } from "hono";
import { createDb } from "../db";
import { megaCenters } from "../db/schema";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
};

const megaCentersRouter = new Hono<Env>();

// ─── GET /api/mega-centers ──────────────────────────────────────────────────
// Returns all mega centers. Public endpoint (used during registration).
megaCentersRouter.get("/", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const allCenters = await db.select().from(megaCenters);
  return c.json(allCenters);
});

export default megaCentersRouter;
