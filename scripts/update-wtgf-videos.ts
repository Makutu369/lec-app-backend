import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.dev.vars") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in .dev.vars");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function updateWtgfVideos() {
  console.log("Updating WTGF course sections with video URLs...");

  const videoUpdates = [
    { title: "Born Again", videoUrl: "https://pub-4756f0cf72dc47d9be43ff1e34cc6f82.r2.dev/wtgf_class_1_born_again/wtgf_class_1_born_again.m3u8" },
    { title: "Holy Spirit", videoUrl: "https://pub-4756f0cf72dc47d9be43ff1e34cc6f82.r2.dev/wtgf_class_2_holy_spirit/wtgf_class_2_holy_spirit.m3u8" },
    { title: "Righteousness", videoUrl: "https://pub-4756f0cf72dc47d9be43ff1e34cc6f82.r2.dev/wtgf_class_3_righteousness/wtgf_class_3_righteousness.m3u8" },
    { title: "You are not a sinner", videoUrl: "https://pub-4756f0cf72dc47d9be43ff1e34cc6f82.r2.dev/wtgf_class_4_you_are_not_a_sinner/wtgf_class_4_you_are_not_a_sinner.m3u8" },
    { title: "Soul winning", videoUrl: "https://pub-4756f0cf72dc47d9be43ff1e34cc6f82.r2.dev/wtgf_class_5_soul_winning/wtgf_class_5_soul_winning.m3u8" },
  ];

  for (const update of videoUpdates) {
    await sql`
      UPDATE sections
      SET "videoUrl" = ${update.videoUrl}
      WHERE title = ${update.title}
    `;
    console.log(`  Updated section: ${update.title}`);
  }

  console.log("Done!");
}

updateWtgfVideos().catch((err) => {
  console.error("Update failed:", err);
  process.exit(1);
});
