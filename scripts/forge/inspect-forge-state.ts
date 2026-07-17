import { prisma } from "../../apps/api/src/db.js";

async function main() {
  const builds = await prisma.forgeBuildRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      application: { select: { name: true } },
      platformBuilds: { select: { id: true, status: true, runnerId: true, startedAtUtc: true } },
    },
  });

  const runners = await prisma.forgeRunner.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      currentJobCount: true,
      maximumConcurrentJobs: true,
      lastHeartbeatAtUtc: true,
    },
  });

  console.log(JSON.stringify({ builds, runners }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
