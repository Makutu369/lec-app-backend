import { eq, and, desc } from "drizzle-orm";
import type { Db } from "../db";
import { examEnrollments, payments, type Exam, type Payment } from "../db/schema";
import { verifyTransaction, type PaystackConfig } from "./paystack";

export const EXAM_CURRENCY = "GHS";

/** Exams with no price (or 0) can be taken without paying. */
export function isExamFree(exam: Pick<Exam, "price">): boolean {
  return !exam.price || exam.price <= 0;
}

export async function hasPaidForExam(
  db: Db,
  userId: string,
  examId: string
): Promise<boolean> {
  const [enrollment] = await db
    .select({ paidAt: examEnrollments.paidAt })
    .from(examEnrollments)
    .where(and(eq(examEnrollments.userId, userId), eq(examEnrollments.examId, examId)))
    .limit(1);
  return Boolean(enrollment?.paidAt);
}

/**
 * Mark a payment successful and give the user access to its exam.
 * Idempotent: safe to call from the webhook, status polling and the cron.
 * Returns true when this call is the one that confirmed it.
 */
export async function fulfillPayment(db: Db, payment: Payment): Promise<boolean> {
  const now = new Date().toISOString();

  const updated = await db
    .update(payments)
    .set({ status: "success", paidAt: now })
    .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")))
    .returning({ id: payments.id });

  await db
    .insert(examEnrollments)
    .values({ userId: payment.userId, examId: payment.examId, paidAt: now })
    .onConflictDoNothing();

  // Already enrolled (unpaid): record the payment on the existing enrollment.
  const [enrollment] = await db
    .select({ id: examEnrollments.id, paidAt: examEnrollments.paidAt })
    .from(examEnrollments)
    .where(
      and(
        eq(examEnrollments.userId, payment.userId),
        eq(examEnrollments.examId, payment.examId)
      )
    )
    .limit(1);
  if (enrollment && !enrollment.paidAt) {
    await db
      .update(examEnrollments)
      .set({ paidAt: now })
      .where(eq(examEnrollments.id, enrollment.id));
  }

  // True only for the call that moved it from pending to success.
  return updated.length > 0;
}

/**
 * Check a Paystack transaction and fulfil it if it succeeded for the full
 * amount. Returns true when the payment is (now) successful.
 */
export async function reconcilePayment(
  db: Db,
  config: PaystackConfig,
  payment: Payment,
  onConfirmed?: (payment: Payment) => Promise<void>
): Promise<boolean> {
  if (payment.status === "success") return true;

  const tx = await verifyTransaction(config, payment.reference);
  const paidInFull =
    tx.status === "success" &&
    tx.amount >= payment.amount &&
    tx.currency.toUpperCase() === payment.currency.toUpperCase();

  if (paidInFull) {
    if ((await fulfillPayment(db, payment)) && onConfirmed) await onConfirmed(payment);
    return true;
  }
  if (tx.status === "failed" || tx.status === "abandoned") {
    await db
      .update(payments)
      .set({ status: "failed" })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
  }
  return false;
}

/** The user's most recent still-pending payment for an exam, if any. */
export async function latestPendingPayment(
  db: Db,
  userId: string,
  examId: string
): Promise<Payment | undefined> {
  const [payment] = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.examId, examId),
        eq(payments.status, "pending")
      )
    )
    .orderBy(desc(payments.createdAt))
    .limit(1);
  return payment;
}
