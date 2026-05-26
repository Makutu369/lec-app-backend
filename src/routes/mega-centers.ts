import { Hono } from "hono";
import { createDb } from "../db";
import { megaCenters } from "../db/schema";

type Env = {
  Bindings: {
    DATABASE_URL: string;
  };
};

const megaCentersRouter = new Hono<Env>();

megaCentersRouter.get("/", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const allCenters = await db.select().from(megaCenters);
  return c.json(allCenters, 200, {
    "Cache-Control": "public, max-age=3600",
  });
});

export default megaCentersRouter;
