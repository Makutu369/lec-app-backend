import { count, eq } from "drizzle-orm";
import type { Db } from "../db";
import { branches, megaCenters } from "../db/schema";

export type Affiliation = { branch: string | null; megaCenter: string | null };

/**
 * Check a branch / mega center pair and fill in the branch from the mega
 * center when only that is given (app versions before branches send only
 * megaCenterId). A branch that has mega centers needs one picked.
 */
export async function resolveAffiliation(
  db: Db,
  input: { branchId?: string | null; megaCenterId?: string | null }
): Promise<{ ok: true; value: Affiliation } | { ok: false; error: string }> {
  let center: { id: string; branchId: string | null } | undefined;
  if (input.megaCenterId) {
    [center] = await db
      .select({ id: megaCenters.id, branchId: megaCenters.branchId })
      .from(megaCenters)
      .where(eq(megaCenters.id, input.megaCenterId))
      .limit(1);
    if (!center) return { ok: false, error: "Mega center not found" };
  }

  const branchId = input.branchId ?? center?.branchId ?? null;
  if (branchId) {
    const [branch] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.id, branchId))
      .limit(1);
    if (!branch) return { ok: false, error: "Branch not found" };

    if (center && center.branchId !== branchId) {
      return { ok: false, error: "That mega center is not in the selected branch" };
    }
    if (!center) {
      const [{ n }] = await db
        .select({ n: count() })
        .from(megaCenters)
        .where(eq(megaCenters.branchId, branchId));
      if (n > 0) return { ok: false, error: "Please select your Mega Center" };
    }
  }

  return { ok: true, value: { branch: branchId, megaCenter: center?.id ?? null } };
}
