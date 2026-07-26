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
  const passwordForgeMobileLead =
    process.env.SEED_FORGE_MOBILE_LEAD_PASSWORD ??
    process.env.SEED_FORGE_ADMIN_PASSWORD ??
    "ForgeMobileLead1!";
  const h1 = await bcrypt.hash(passwordLead, 10);
  const h2 = await bcrypt.hash(passwordAsst, 10);
  const hForgeMobileLead = await bcrypt.hash(passwordForgeMobileLead, 10);

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

  // Migrate legacy Forge roles → forge_mobile_lead (also covered by SQL migration).
  await prisma.user.updateMany({
    where: { role: { in: ["forge_admin", "forge_pm"] } },
    data: { role: "forge_mobile_lead" },
  });

  const existingForgeAdmin = await prisma.user.findUnique({
    where: { email: "forge-admin@local.dev" },
  });
  if (existingForgeAdmin) {
    await prisma.user.update({
      where: { id: existingForgeAdmin.id },
      data: {
        email: "forge-mobile-lead@local.dev",
        passwordHash: hForgeMobileLead,
        displayName: "Forge Mobile Lead",
        role: "forge_mobile_lead",
      },
    });
  } else {
    await prisma.user.upsert({
      where: { email: "forge-mobile-lead@local.dev" },
      create: {
        email: "forge-mobile-lead@local.dev",
        passwordHash: hForgeMobileLead,
        displayName: "Forge Mobile Lead",
        role: "forge_mobile_lead",
      },
      update: {
        passwordHash: hForgeMobileLead,
        displayName: "Forge Mobile Lead",
        role: "forge_mobile_lead",
      },
    });
  }

  // Former PM demo account becomes a mobile-lead login (no forge_pm role).
  const legacyPmEmail = process.env.SEED_FORGE_PM_EMAIL ?? "a.almesbahi@masarat.ly";
  const existingPm = await prisma.user.findFirst({
    where: { OR: [{ email: "pm@local.dev" }, { email: legacyPmEmail }] },
  });
  if (existingPm) {
    await prisma.user.update({
      where: { id: existingPm.id },
      data: {
        role: "forge_mobile_lead",
        displayName: existingPm.displayName?.includes("Project Manager")
          ? "Forge Mobile Lead"
          : existingPm.displayName,
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
          iosEnabled: true,
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
          iosEnabled: true,
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

    const existingMockProfile = await prisma.forgeBuildProfile.findFirst({
      where: { applicationId: gatewayApp.id, name: "mock-release" },
    });
    if (!existingMockProfile) {
      await prisma.forgeBuildProfile.create({
        data: {
          applicationId: gatewayApp.id,
          name: "mock-release",
          description: "Mock release APK/IPA (main_mock + build_runner recipe).",
          dartEntryPoint: "lib/main_mock.dart",
          androidArtifactType: "apk",
          androidBuildMode: "release",
          iosExportMethod: "ad-hoc",
          timeoutMinutes: 120,
          isActive: true,
        },
      });
    } else {
      await prisma.forgeBuildProfile.update({
        where: { id: existingMockProfile.id },
        data: {
          dartEntryPoint: "lib/main_mock.dart",
          androidBuildMode: "release",
          iosExportMethod: "ad-hoc",
          isActive: true,
        },
      });
    }
    console.log(
      "Seeded Forge application Masarat Gateway Tester + debug-demo + mock-release profiles (JUM).",
    );
  }

  await seedCatalog(prisma);
  await seedCatalogInventory(prisma);
  const env = loadEnv();
  await seedConnectionTokensFromEnv(prisma, env);
  await seedHelmGithubRepository(prisma, catalogEnvFrom(env));

  console.log(
    "Sign-in accounts: lead@local.dev, assistant@local.dev, forge-mobile-lead@local.dev",
  );
  console.log(
    "Passwords: SEED_LEAD_PASSWORD / SEED_ASSISTANT_PASSWORD / SEED_FORGE_MOBILE_LEAD_PASSWORD (legacy SEED_FORGE_ADMIN_PASSWORD accepted)",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
