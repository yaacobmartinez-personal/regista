import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

// Shared demo password for all seeded organizer accounts.
const DEMO_PASSWORD = "password123";

async function seedTenant({ slug, name, adminEmail, adminName, passwordHash }) {
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { slug, name, status: "ACTIVE" },
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
    update: { role: "ADMIN" },
    create: { userId: admin.id, tenantId: tenant.id, role: "ADMIN" },
  });

  return { tenant, admin };
}

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD);

  const { tenant: acme } = await seedTenant({
    slug: "acme",
    name: "Acme Events",
    adminEmail: "admin@acme.test",
    adminName: "Acme Admin",
    passwordHash,
  });

  await seedTenant({
    slug: "beta",
    name: "Beta Collective",
    adminEmail: "admin@beta.test",
    adminName: "Beta Admin",
    passwordHash,
  });

  await prisma.event.upsert({
    where: { tenantId_slug: { tenantId: acme.id, slug: "summer-meetup" } },
    update: {},
    create: {
      tenantId: acme.id,
      slug: "summer-meetup",
      title: "Acme Summer Meetup",
      description: "An evening of talks and networking.",
      startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      capacity: 100,
      waitlistEnabled: true,
      status: "PUBLISHED",
    },
  });

  console.log("Seed complete.");
  console.log(`  Organizers (password: ${DEMO_PASSWORD}):`);
  console.log("    admin@acme.test  -> acme  (ADMIN)");
  console.log("    admin@beta.test  -> beta  (ADMIN)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
