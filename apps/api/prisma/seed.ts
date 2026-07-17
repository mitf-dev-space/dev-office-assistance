import { PrismaClient, type DevTeam } from "@prisma/client";

import bcrypt from "bcryptjs";

import { MASARAT_ROSTER, parseHireDate } from "./roster-seed-data.js";
import { seedCatalog } from "./catalog-seed.js";
import { seedCatalogInventory } from "../src/catalog/seed/inventorySeed.js";
import { seedConnectionTokensFromEnv } from "../src/catalog/seed/connectionTokens.js";
import { seedHelmGithubRepository } from "../src/catalog/seed/helmGithubRepository.js";
import { loadEnv, catalogEnvFrom } from "../src/env.js";
import { seedConnectionTokensFromEnv } from "../src/catalog/seed/connectionTokens.js";
import { seedHelmGithubRepository } from "../src/catalog/seed/helmGithubRepository.js";
import { loadEnv, catalogEnvFrom } from "../src/env.js";

const prisma = new PrismaClient();

export const SEED_DEV_IDS = {
  lead: "00000000-0000-4000-8000-000000000001",
  assistant: "00000000-0000-4000-8000-000000000002",
} as const;

async function seedTeamMembership(developerId: string, team: DevTeam, isTeamLead: boolean) {
  await prisma.teamMembership.upsert({
    where: { developerId_team: { developerId, team } },
    create: { developerId, team, isTeamLead },
    update: { isTeamLead },
  });
}

async function main() {
  const passwordLead = process.env.SEED_LEAD_PASSWORD ?? "lead";
  const passwordAsst = process.env.SEED_ASSISTANT_PASSWORD ?? "ChangeMe!Asst1";
  const passwordForgeAdmin = process.env.SEED_FORGE_ADMIN_PASSWORD ?? "ForgeAdmin1!";
  const passwordForgePm = process.env.SEED_FORGE_PM_PASSWORD ?? "ForgePm1!";
  const h1 = await bcrypt.hash(passwordLead, 10);
  const h2 = await bcrypt.hash(passwordAsst, 10);
  const hForgeAdmin = await bcrypt.hash(passwordForgeAdmin, 10);
  const hForgePm = await bcrypt.hash(passwordForgePm, 10);

  await prisma.user.upsert({
    where: { email: "lead@local.dev" },
    create: {
      email: "lead@local.dev",
      passwordHash: h1,
      displayName: "أنس جمال سالم المصباحي",
      role: "lead",
    },
    update: {
      passwordHash: h1,
      displayName: "أنس جمال سالم المصباحي",
    },
  });

  await prisma.user.upsert({
    where: { email: "assistant@local.dev" },
    create: {
      email: "assistant@local.dev",
      passwordHash: h2,
      displayName: "فيروز عادل محمد بشير",
      role: "assistant",
    },
    update: {
      passwordHash: h2,
      displayName: "فيروز عادل محمد بشير",
    },
  });

  await prisma.user.upsert({
    where: { email: "forge-admin@local.dev" },
    create: {
      email: "forge-admin@local.dev",
      passwordHash: hForgeAdmin,
      displayName: "Forge Administrator",
      role: "forge_admin",
    },
    update: {
      passwordHash: hForgeAdmin,
      role: "forge_admin",
    },
  });

  const forgePmEmail = process.env.SEED_FORGE_PM_EMAIL ?? "a.almesbahi@masarat.ly";
  const existingPm = await prisma.user.findFirst({
    where: { OR: [{ email: "pm@local.dev" }, { email: forgePmEmail }, { role: "forge_pm" }] },
  });
  if (existingPm) {
    await prisma.user.update({
      where: { id: existingPm.id },
      data: {
        email: forgePmEmail,
        passwordHash: hForgePm,
        displayName: "Project Manager Demo",
        role: "forge_pm",
      },
    });
  } else {
    await prisma.user.create({
      data: {
        email: forgePmEmail,
        passwordHash: hForgePm,
        displayName: "Project Manager Demo",
        role: "forge_pm",
      },
    });
  }

  const devCount = await prisma.developer.count();
  if (devCount > 0) {
    console.log("Developers table already has rows; skipping roster + team seed (use a fresh db or reset).");
  } else {
    for (const row of MASARAT_ROSTER) {
      const dev = await prisma.developer.create({
        data: {
          ...(row.id ? { id: row.id } : {}),
          displayName: row.displayName,
          workEmail: row.workEmail,
          phone: row.phone,
          jobTitle: row.jobTitle,
          skills: row.skills,
          tenureLabel: row.tenureLabel,
          hireDate: parseHireDate(row.hireRaw),
          rosterPosition: row.rosterPosition,
        },
      });
      if (row.team) {
        await seedTeamMembership(dev.id, row.team, row.isTeamLead);
      }
    }
    console.log(`Seeded ${MASARAT_ROSTER.length} developers and their team assignments.`);
  }

  const demoBanks = [
    { code: "JUM", name: "Jumhoria Bank" },
    { code: "TEJ", name: "Tejari Bank" },
    { code: "SAH", name: "Sahara Bank" },
  ] as const;

  for (const bank of demoBanks) {
    await prisma.forgeBank.upsert({
      where: { code: bank.code },
      create: { code: bank.code, name: bank.name, isActive: true },
      update: { name: bank.name, isActive: true },
    });
  }
  console.log(`Seeded ${demoBanks.length} Forge demo banks (${demoBanks.map((b) => b.code).join(", ")}).`);

  const jumBank = await prisma.forgeBank.findUnique({ where: { code: "JUM" } });
  if (jumBank) {
    let gatewayApp = await prisma.forgeApplication.findFirst({
      where: { bankId: jumBank.id, name: "Masarat Gateway Tester" },
    });
    if (!gatewayApp) {
      gatewayApp = await prisma.forgeApplication.create({
        data: {
          bankId: jumBank.id,
          name: "Masarat Gateway Tester",
          description: "Flutter gateway_tester harness for demo Android builds (wallet-services repo).",
          repositoryProvider: "github",
          repositoryUrl: "https://github.com/anstwechy/wallet-services.git",
          projectSubpath: "mobile/gateway_tester",
          defaultBranch: "dev",
          androidEnabled: true,
          iosEnabled: false,
          isActive: true,
        },
      });
    } else {
      gatewayApp = await prisma.forgeApplication.update({
        where: { id: gatewayApp.id },
        data: {
          repositoryUrl: "https://github.com/anstwechy/wallet-services.git",
          projectSubpath: "mobile/gateway_tester",
          defaultBranch: "dev",
          androidEnabled: true,
          iosEnabled: false,
          isActive: true,
        },
      });
    }

    const existingProfile = await prisma.forgeBuildProfile.findFirst({
      where: { applicationId: gatewayApp.id, name: "debug-demo" },
    });
    if (!existingProfile) {
      await prisma.forgeBuildProfile.create({
        data: {
          applicationId: gatewayApp.id,
          name: "debug-demo",
          description: "Debug APK for PM walkthrough builds.",
          dartEntryPoint: "lib/main.dart",
          androidArtifactType: "apk",
          androidBuildMode: "debug",
          timeoutMinutes: 90,
          isActive: true,
        },
      });
    }
    console.log("Seeded Forge application Masarat Gateway Tester + debug-demo profile (JUM).");
  }

  await seedCatalog(prisma);
  await seedCatalogInventory(prisma);
  const env = loadEnv();
  await seedConnectionTokensFromEnv(prisma, env);
  await seedHelmGithubRepository(prisma, catalogEnvFrom(env));

  console.log(
    `Sign-in accounts: lead@local.dev, assistant@local.dev, forge-admin@local.dev, ${forgePmEmail}`,
  );
  console.log(
    "Passwords: SEED_LEAD_PASSWORD / SEED_ASSISTANT_PASSWORD / SEED_FORGE_ADMIN_PASSWORD / SEED_FORGE_PM_PASSWORD",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
