import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { createDb } from "../db";
import { certificates } from "../db/schema";
import { authGuard } from "../middleware/auth";
import type { JwtPayload } from "../lib/jwt";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    user: JwtPayload;
  };
};

const certificatesRouter = new Hono<Env>();

// Everything the app needs to render a certificate without extra requests.
const certificateWith = {
  user: {
    columns: { firstName: true, lastName: true, email: true },
  },
  exam: {
    columns: { id: true, title: true, passingScore: true },
    with: { course: { columns: { id: true, title: true } } },
  },
} as const;

certificatesRouter.get("/", authGuard, async (c) => {
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const mine = await db.query.certificates.findMany({
    where: eq(certificates.userId, user.sub),
    with: certificateWith,
    orderBy: (certificates, { desc }) => [desc(certificates.issuedAt)],
  });

  return c.json(mine);
});

certificatesRouter.get("/:id", authGuard, async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const certificate = await db.query.certificates.findFirst({
    where: and(eq(certificates.id, id), eq(certificates.userId, user.sub)),
    with: certificateWith,
  });

  if (!certificate) {
    return c.json({ error: "Certificate not found" }, 404);
  }

  return c.json(certificate);
});

export default certificatesRouter;
