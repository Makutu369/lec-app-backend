import { eq, and, inArray } from "drizzle-orm";
import type { Db } from "../db";
import {
  sections,
  enrollments,
  progress,
  certificates,
} from "../db/schema";
import type { Certificate } from "../db/schema";

export type CourseExamAccess = {
  enrolled: boolean;
  completedSections: number;
  totalSections: number;
  /** True once the user is enrolled and has completed every section. */
  unlocked: boolean;
};

/**
 * A course's package exam unlocks only after the user has completed every
 * section of that course. Sections added after enrollment have no progress
 * row yet, so they count as not completed.
 */
export async function getCourseExamAccess(
  db: Db,
  userId: string,
  courseId: string
): Promise<CourseExamAccess> {
  const [enrollment] = await db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .limit(1);

  const courseSections = await db
    .select({ id: sections.id })
    .from(sections)
    .where(eq(sections.courseId, courseId));

  const totalSections = courseSections.length;
  let completedSections = 0;

  if (enrollment && totalSections > 0) {
    const done = await db
      .select({ id: progress.id })
      .from(progress)
      .where(
        and(
          eq(progress.userId, userId),
          eq(progress.completed, true),
          inArray(
            progress.sectionId,
            courseSections.map((s) => s.id)
          )
        )
      );
    completedSections = done.length;
  }

  return {
    enrolled: Boolean(enrollment),
    completedSections,
    totalSections,
    unlocked: Boolean(enrollment) && completedSections >= totalSections,
  };
}

// No 0/O or 1/I so numbers can be read out and typed back without mistakes.
const CERT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCertificateNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (const b of bytes) {
    code += CERT_ALPHABET[b % CERT_ALPHABET.length];
  }
  return `LEC-${new Date().getUTCFullYear()}-${code}`;
}

export async function findCertificate(
  db: Db,
  userId: string,
  examId: string
): Promise<Certificate | undefined> {
  const [certificate] = await db
    .select()
    .from(certificates)
    .where(
      and(eq(certificates.userId, userId), eq(certificates.examId, examId))
    )
    .limit(1);
  return certificate;
}

/**
 * Issue a certificate for a passed exam. Idempotent: one certificate per user
 * per exam, so later passing attempts return the original certificate.
 */
export async function issueCertificate(
  db: Db,
  params: { userId: string; examId: string; attemptId: string; score: number }
): Promise<Certificate> {
  const existing = await findCertificate(db, params.userId, params.examId);
  if (existing) return existing;

  // Retry covers the (very unlikely) certificate-number collision.
  for (let i = 0; i < 3; i++) {
    const [created] = await db
      .insert(certificates)
      .values({ ...params, certificateNumber: generateCertificateNumber() })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    // A concurrent submit may have issued it first.
    const raced = await findCertificate(db, params.userId, params.examId);
    if (raced) return raced;
  }

  throw new Error("Failed to issue certificate");
}
