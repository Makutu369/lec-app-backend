import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { exams, notifications, users, type Payment } from "../db/schema";
import { sendPushes, tokensForUsers, type ExpoPushConfig } from "./expo-push";

export type NotificationType =
  | "payment_confirmed"
  | "certificate_earned"
  | "course_enrolled"
  | "reminder_continue_course"
  | "reminder_exam_ready"
  | "reminder_finish_payment"
  | "announcement";

/** Reminder types respect the user's "reminders" preference; the rest always go out. */
const REMINDER_TYPES: NotificationType[] = [
  "reminder_continue_course",
  "reminder_exam_ready",
  "reminder_finish_payment",
];

export type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /**
   * Where a tap should take the user. `url` is an app route, e.g.
   * "/(exams)/details" with `params: { examId }`.
   */
  data?: { url?: string; params?: Record<string, string> } & Record<string, unknown>;
  /** Same key for the same user = sent once only. */
  dedupeKey?: string;
};

export type NotifyEnv = {
  EXPO_PUSH_URL?: string;
  EXPO_ACCESS_TOKEN?: string;
};

export function pushConfig(env: NotifyEnv): ExpoPushConfig {
  return { baseUrl: env.EXPO_PUSH_URL, accessToken: env.EXPO_ACCESS_TOKEN };
}

/**
 * Store notifications in the inbox and push the ones that are new.
 * Returns how many were created (duplicates by dedupeKey are skipped).
 */
export async function notifyUsers(db: Db, config: ExpoPushConfig, items: NewNotification[]): Promise<number> {
  if (items.length === 0) return 0;

  // Drop reminders for users who turned reminders off.
  const reminderUserIds = [
    ...new Set(items.filter((i) => REMINDER_TYPES.includes(i.type)).map((i) => i.userId)),
  ];
  let optedOut = new Set<string>();
  if (reminderUserIds.length > 0) {
    const rows = await db
      .select({ id: users.id, notifyReminders: users.notifyReminders })
      .from(users)
      .where(inArray(users.id, reminderUserIds));
    optedOut = new Set(rows.filter((r) => !r.notifyReminders).map((r) => r.id));
  }
  const wanted = items.filter((i) => !(REMINDER_TYPES.includes(i.type) && optedOut.has(i.userId)));
  if (wanted.length === 0) return 0;

  const created = await db
    .insert(notifications)
    .values(
      wanted.map((i) => ({
        userId: i.userId,
        type: i.type,
        title: i.title,
        body: i.body,
        data: i.data ?? null,
        dedupeKey: i.dedupeKey ?? null,
      }))
    )
    .onConflictDoNothing()
    .returning();

  if (created.length === 0) return 0;

  const tokens = await tokensForUsers(db, [...new Set(created.map((n) => n.userId))]);
  const messages = created.flatMap((n) =>
    tokens
      .filter((t) => t.userId === n.userId)
      .map((t) => ({
        to: t.token,
        title: n.title,
        body: n.body,
        data: { ...((n.data as Record<string, unknown>) ?? {}), notificationId: n.id },
      }))
  );
  await sendPushes(db, config, messages);

  return created.length;
}

// --- Event notifications ---

export async function notifyPaymentConfirmed(
  db: Db,
  config: ExpoPushConfig,
  p: { userId: string; paymentId: string; examId: string; examTitle: string }
): Promise<void> {
  await notifyUsers(db, config, [
    {
      userId: p.userId,
      type: "payment_confirmed",
      title: "Payment confirmed",
      body: `You can now take "${p.examTitle}". Good luck!`,
      data: { url: "/(exams)/details", params: { examId: p.examId } },
      dedupeKey: `paid:${p.paymentId}`,
    },
  ]);
}

export async function notifyCertificateEarned(
  db: Db,
  config: ExpoPushConfig,
  c: { userId: string; certificateId: string; examTitle: string }
): Promise<void> {
  await notifyUsers(db, config, [
    {
      userId: c.userId,
      type: "certificate_earned",
      title: "Congratulations! 🎉",
      body: `You passed "${c.examTitle}" and earned your certificate.`,
      data: { url: "/(exams)/certificate", params: { certificateId: c.certificateId } },
      dedupeKey: `certificate:${c.certificateId}`,
    },
  ]);
}

export async function notifyEnrolled(
  db: Db,
  config: ExpoPushConfig,
  e: { userId: string; courseId: string; courseTitle: string; lessons: number }
): Promise<void> {
  const lessons = e.lessons === 1 ? "1 lesson" : `${e.lessons} lessons`;
  await notifyUsers(db, config, [
    {
      userId: e.userId,
      type: "course_enrolled",
      title: `You're enrolled in ${e.courseTitle} 🎉`,
      body: e.lessons > 0 ? `${lessons} waiting for you. Start with lesson 1 whenever you're ready.` : "Tap to open the course.",
      data: { url: "/(screens)/course-detail", params: { courseId: e.courseId } },
      // Once per course: re-enrolling never notifies again.
      dedupeKey: `enrolled:${e.courseId}`,
    },
  ]);
}

/** "Payment confirmed" for a payment row (looks up the exam title). */
export async function notifyPaid(db: Db, config: ExpoPushConfig, payment: Payment): Promise<void> {
  const [exam] = await db.select({ title: exams.title }).from(exams).where(eq(exams.id, payment.examId)).limit(1);
  await notifyPaymentConfirmed(db, config, {
    userId: payment.userId,
    paymentId: payment.id,
    examId: payment.examId,
    examTitle: exam?.title ?? "your exam",
  });
}
