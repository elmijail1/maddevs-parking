import { prisma } from "../src/db";

const spaceNames = ["A1", "A2", "A3", "B1", "B2", "B3"];

try {
  const { count } = await prisma.space.createMany({
    data: spaceNames.map((displayName) => ({ displayName })),
    skipDuplicates: true,
  });
  console.log(`Seeded ${count} new spaces`);
} finally {
  await prisma.$disconnect();
}
