import { prisma } from "../src/db";
import { spaceDisplayNames } from "../src/lot";

try {
  const { count } = await prisma.space.createMany({
    data: spaceDisplayNames.map((displayName) => ({ displayName })),
    skipDuplicates: true,
  });
  console.log(`Seeded ${count} new spaces`);
} finally {
  await prisma.$disconnect();
}
