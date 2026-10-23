import { and, eq, gt, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { createDb, type Db } from "../db";
import { payments } from "../db/schema";
import { processReceipts } from "./expo-push";
import { reconcilePayment } from "./exam-payment";
import { notifyPaid, notifyUsers, pushConfig, type NewNotification, type NotifyEnv } from "./notify";

export type ScheduledEnv = NotifyEnv & {
  DATABASE_URL: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_BASE_URL?: string;
};

/** Cron schedules (also in wrangler.json). */
export const CRON_FREQUENT = "*/15 * * * *";
// 18:00 UTC = 6 pm in Ghana: after work/school, before it's late.
export const CRON_DAILY_REMINDERS = "0 18 * * *";

const INACTIVE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bucket number for "at most once per N days" dedupe keys. */
function period(days: number, now = Date.now()): number {
  return Math.floor(now / (days * DAY_MS));
}

export async function runScheduled(cron: string, env: ScheduledEnv): Promise<Record<string, unknown>> {
  const db = createDb(env.DATABASE_URL);
  if (cron === CRON_DAILY_REMINDERS) {
    return sendDailyReminders(db, env);
  }
  return runFrequentJobs(db, env);
}

/** Every 15 min: delivery receipts + catch payments whose webhook never arrived. */
export async function runFrequentJobs(db: Db, env: ScheduledEnv): Promise<Record<string, unknown>> {
  const config = pushConfig(env);
  const receipts = await processReceipts(db, config);

  let reconciled = 0;
  if (env.PAYSTACK_SECRET_KEY) {
    const paystack = { secretKey: env.PAYSTACK_SECRET_KEY, baseUrl: env.PAYSTACK_BASE_URL };
    const pending = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.status, "pending"),
          lt(payments.createdAt, new Date(Date.now() - 2 * 60 * 1000).toISOString()),
          gt(payments.createdAt, new Date(Date.now() - 2 * DAY_MS).toISOString())
        )
      )
      .limit(50);
    for (const payment of pending) {
      try {
        await reconcilePayment(db, paystack, payment, async (p) => {
          reconciled++;
          await notifyPaid(db, config, p);
        });
      } catch (err) {
        console.error("[cron] reconcile failed:", payment.reference, err);
      }
    }
  }

  return { receipts, reconciled };
}

/** Daily: nudge people who stalled. Each reminder is deduped per period. */
export async function sendDailyReminders(db: Db, env: ScheduledEnv): Promise<Record<string, unknown>> {
  const config = pushConfig(env);
  const items: NewNotification[] = [];

  // 1. Started a course, not finished, hasn't opened the app for 3+ days.
  const stalled = await db.execute<{
    userId: string;
    courseId: string;
    title: string;
    total: number;
    done: number;
  }>(sql`
    select e."userId", e."courseId", c.title,
           count(s.id)::int as total,
           (count(p.id) filter (where p.completed))::int as done
    from enrollments e
    join courses c on c.id = e."courseId"
    join sections s on s."courseId" = e."courseId"
    left join progress p on p."sectionId" = s.id and p."userId" = e."userId"
    where e."createdAt" < now() - make_interval(days => ${INACTIVE_DAYS})
      and not exists (
        select 1 from push_tokens t
        where t."userId" = e."userId"
          and t."lastSeenAt" > now() - make_interval(days => ${INACTIVE_DAYS})
      )
    group by e."userId", e."courseId", c.title
    having (count(p.id) filter (where p.completed)) < count(s.id)
  `);
  for (const r of stalled.rows) {
    items.push({
      userId: r.userId,
      type: "reminder_continue_course",
      title: `Keep going with ${r.title}`,
      body:
        r.done > 0
          ? `You've completed ${r.done} of ${r.total} lessons. Pick up where you left off.`
          : `Your ${r.total} lessons are waiting. Start the first one today.`,
      data: { url: "/(screens)/course-detail", params: { courseId: r.courseId } },
      dedupeKey: `continue:${r.courseId}:${period(7)}`,
    });
  }

  // 2. Finished every lesson of a course whose exam they haven't passed.
  const examReady = await db.execute<{ userId: string; examId: string; examTitle: string; courseId: string }>(sql`
    select e."userId", x.id as "examId", x.title as "examTitle", x."courseId"
    from enrollments e
    join exams x on x."courseId" = e."courseId" and x."isPublished" = true
    where not exists (
        select 1 from sections s
        left join progress p on p."sectionId" = s.id and p."userId" = e."userId" and p.completed
        where s."courseId" = e."courseId" and p.id is null
      )
      and exists (select 1 from sections s where s."courseId" = e."courseId")
      and not exists (
        select 1 from exam_attempts a
        where a."userId" = e."userId" and a."examId" = x.id and a.passed
      )
  `);
  for (const r of examReady.rows) {
    items.push({
      userId: r.userId,
      type: "reminder_exam_ready",
      title: "You're ready for the exam",
      body: `You've finished all the lessons. Take "${r.examTitle}" to earn your certificate.`,
      data: { url: "/(exams)/details", params: { examId: r.examId, courseId: r.courseId } },
      dedupeKey: `exam-ready:${r.examId}:${period(14)}`,
    });
  }

  // 3. Started paying for an exam (1-48 h ago) but never finished.
  const unpaid = await db.execute<{ userId: string; examId: string; examTitle: string }>(sql`
    select distinct p."userId", p."examId", x.title as "examTitle"
    from payments p
    join exams x on x.id = p."examId"
    where p.status in ('pending', 'failed')
      and p."createdAt" between now() - interval '48 hours' and now() - interval '1 hour'
      and not exists (
        select 1 from exam_enrollments en
        where en."userId" = p."userId" and en."examId" = p."examId" and en."paidAt" is not null
      )
  `);
  for (const r of unpaid.rows) {
    items.push({
      userId: r.userId,
      type: "reminder_finish_payment",
      title: "Finish your exam payment",
      body: `Your payment for "${r.examTitle}" wasn't completed. Tap to finish it and start your exam.`,
      data: { url: "/(exams)/details", params: { examId: r.examId } },
      dedupeKey: `finish-payment:${r.examId}:${period(7)}`,
    });
  }

  const sent = await notifyUsers(db, config, items);
  return {
    candidates: { continueCourse: stalled.rows.length, examReady: examReady.rows.length, finishPayment: unpaid.rows.length },
    sent,
  };
}
