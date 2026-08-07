/**
 * Prints a valid session cookie for a seeded user, so the API can be exercised
 * from curl or a script without driving the login form.
 *
 *   npm run dev:session -- priya@acme.test
 *
 * Development helper only — it mints a real session, so never run it against a
 * production database.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashToken, randomToken } from "../src/lib/tokens";

async function main() {
  const email = process.argv[2] ?? "priya@acme.test";

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}. Run \`npm run seed\` first.`);
    process.exit(1);
  }

  const token = randomToken(32);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userAgent: "dev-session script",
    },
  });

  console.log(`deskly_session=${token}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
