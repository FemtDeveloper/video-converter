import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const apiKey = process.env.INITIAL_API_KEY;
  if (!apiKey) {
    throw new Error("INITIAL_API_KEY must be set to run the seed script");
  }

  const saltRounds = 12;
  const keyHash = await bcrypt.hash(apiKey, saltRounds);

  const organization = await prisma.organization.upsert({
    where: { slug: "beta" },
    create: {
      name: "Beta Organization",
      slug: "beta",
      apiKeys: {
        create: {
          label: "Beta shared key",
          keyPrefix: apiKey.slice(0, 8),
          keyHash,
        },
      },
    },
    update: {},
    include: { apiKeys: true },
  });

  console.log(
    "Seed complete. Organization " +
      organization.name +
      " ready with " +
      organization.apiKeys.length +
      " API key(s).",
  );
}

main()
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
