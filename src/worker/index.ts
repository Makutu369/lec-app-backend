import { Hono } from "hono";
import { cors } from "hono/cors";
import authRoutes from "../routes/auth";
import coursesRoutes from "../routes/courses";
import sectionsRoutes from "../routes/sections";
import megaCentersRoutes from "../routes/mega-centers";
import branchesRoutes from "../routes/branches";
import examsRoutes from "../routes/exams";
import certificatesRoutes from "../routes/certificates";
import paymentsRoutes from "../routes/payments";
import notificationsRoutes from "../routes/notifications";
import usersRoutes from "../routes/users";
import { runScheduled, type ScheduledEnv } from "../lib/scheduled";

type Env = {
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
};

const app = new Hono<Env>();

app.use(
  "/api/*",
  cors({
    origin: (origin) => origin || "*",
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

app.get("/api/", (c) =>
  c.json({
    name: "LEC App Backend",
    status: "ok",
    timestamp: new Date().toISOString(),
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/courses", coursesRoutes);
app.route("/api/sections", sectionsRoutes);
app.route("/api/mega-centers", megaCentersRoutes);
app.route("/api/branches", branchesRoutes);
app.route("/api/exams", examsRoutes);
app.route("/api/certificates", certificatesRoutes);
app.route("/api/payments", paymentsRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/users", usersRoutes);

export default {
  fetch: app.fetch,
  // Cron triggers (wrangler.json): receipts + payment reconciliation every
  // 15 min, learning reminders daily at 18:00 UTC.
  async scheduled(controller: ScheduledController, env: ScheduledEnv, ctx: ExecutionContext) {
    ctx.waitUntil(
      runScheduled(controller.cron, env).then(
        (result) => console.log(`[cron ${controller.cron}]`, JSON.stringify(result)),
        (err) => console.error(`[cron ${controller.cron}] failed:`, err)
      )
    );
  },
} satisfies ExportedHandler<ScheduledEnv>;
