import { useCallback, useState, type ReactNode } from "react";
import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Burger,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery, useViewportSize } from "@mantine/hooks";
import { Link, useLocation } from "react-router-dom";
import {
  IconLayoutDashboard,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlus,
  IconReceipt2,
  IconTimelineEvent,
  IconUsers,
  IconUsersGroup,
  IconIdBadge2,
  IconLayoutGrid,
  IconListCheck,
  IconMail,
  IconLogout,
  IconAlertTriangle,
  IconCalendar,
  IconScale,
  IconHammer,
  IconList,
  IconSettings,
} from "@tabler/icons-react";
import type { SessionUser } from "../auth/AuthContext";
import { canAccessForge, canAdminForge, isForgeOnlyUser } from "../lib/forge/roles";
import { useAppTheme } from "../theme/AppThemeContext";
import { brandFooterLine, brandHomeAriaLabel, BRAND_NAME } from "../brand";
import { AppLogo } from "./AppLogo";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { GlobalSearchTrigger } from "./GlobalSearchModal";

const iconProps = { size: 22, stroke: 1.5 };
const NAV_WIDTH_EXPANDED = 278;
const NAV_WIDTH_ICON_RAIL = 80;
/** 48em at 16px root — fallback when viewport hook disagrees with matchMedia. */
const SM_MIN_WIDTH_PX = 768;
const NAV_COLLAPSE_STORAGE_KEY = "office-app-nav-desktop-collapsed";

/** Normalizes localStorage / hand-edits so collapse state is a real boolean. */
function readNavCollapsedFromStorage(value: unknown): boolean {
  if (value === true) return true;
  if (value === "true" || value === 1) return true;
  return false;
}

function readInitialNavCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY);
    if (raw == null) return false;
    return readNavCollapsedFromStorage(JSON.parse(raw) as unknown);
  } catch {
    return false;
  }
}

type AppNavItemProps = {
  to: string;
  label: string;
  leftSection: ReactNode;
  active: boolean;
  onClick: () => void;
  showIconRail: boolean;
  color: string;
  mb?: string | number;
};

function AppNavItem({
  to,
  label,
  leftSection,
  active,
  onClick,
  showIconRail,
  color,
  mb = 4,
}: AppNavItemProps) {
  const link = (
    <NavLink
      component={Link}
      to={to}
      label={showIconRail ? " " : label}
      leftSection={leftSection}
      onClick={onClick}
      active={active}
      variant="light"
      color={color}
      mb={mb}
      aria-label={showIconRail ? label : undefined}
      styles={{
        root: {
          minHeight: 48,
          ...(showIconRail && {
            justifyContent: "center",
            paddingInline: 8,
          }),
        },
        body: showIconRail
          ? {
              flex: 0,
              minWidth: 0,
              width: 0,
              overflow: "hidden",
              margin: 0,
              padding: 0,
              opacity: 0,
            }
          : undefined,
        section: showIconRail ? { marginRight: 0, marginInlineEnd: 0 } : undefined,
      }}
    />
  );

  if (showIconRail) {
    return (
      <Tooltip label={label} position="right" withArrow offset={6} openDelay={200}>
        <Box w="100%">{link}</Box>
      </Tooltip>
    );
  }
  return link;
}

function userInitials(u: SessionUser) {
  const s = (u.displayName ?? u.email ?? "U").trim();
  const p = s.split(/\s+/);
  if (p.length >= 2) {
    return (p[0]![0]! + p[1]![0]!).toUpperCase();
  }
  return s.slice(0, 2).toUpperCase();
}

type Props = {
  user: SessionUser;
  onLogout: () => void;
  children: ReactNode;
};

export function AppLayout({ user, onLogout, children }: Props) {
  const { preset } = useAppTheme();
  const primary = preset.mantinePrimary;
  const [mobileOpen, { toggle, close }] = useDisclosure(false);
  /** In-memory + explicit localStorage (more reliable than Mantine useLocalStorage in some embedded/strict contexts). */
  const [navDesktopCollapsed, setNavDesktopCollapsed] = useState(readInitialNavCollapsed);
  const toggleNavDesktopCollapsed = useCallback(() => {
    setNavDesktopCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const { pathname } = useLocation();
  const theme = useMantineTheme();
  // Default options leave `matches` as undefined for one frame, which breaks the rail. Read matchMedia immediately.
  const isSmByMedia = useMediaQuery(
    `(min-width: ${theme.breakpoints.sm})`,
    true,
    { getInitialValueInEffect: false },
  );
  const { width: viewportWidth } = useViewportSize();
  const isDesktopLayout =
    Boolean(isSmByMedia) || (viewportWidth > 0 && viewportWidth >= SM_MIN_WIDTH_PX);
  const showIconRail = navDesktopCollapsed && isDesktopLayout;
  const navbarWidth = showIconRail ? NAV_WIDTH_ICON_RAIL : NAV_WIDTH_EXPANDED;
  const showHelmCore = !isForgeOnlyUser(user.role);
  const showForge = canAccessForge(user.role);
  const showForgeAdmin = canAdminForge(user.role);
  const homePath = showHelmCore ? "/" : "/forge";

  const navActive = (path: string, options?: { end?: boolean; prefix?: boolean }) => {
    if (options?.prefix) {
      return pathname === path || pathname.startsWith(`${path}/`);
    }
    if (options?.end) {
      return pathname === path;
    }
    return pathname === path;
  };

  return (
    <AppShell
      layout="default"
      padding="md"
      navbar={{
        width: navbarWidth,
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpen, desktop: false },
      }}
      h="100dvh"
      styles={{
        main: {
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          overflow: "auto",
        },
        navbar: { zIndex: 201, transition: "width 0.2s ease", overflow: "hidden" },
        root: { minHeight: 0 },
      }}
    >
      <AppShell.Navbar
        id="app-shell-navbar"
        p={{ base: "sm", sm: showIconRail ? 10 : "md" }}
        aria-label="Main navigation"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div
          className="app-nav-title-wrap"
          style={showIconRail ? { marginBottom: "0.65rem" } : undefined}
        >
          {showIconRail ? (
            <Tooltip label={BRAND_NAME} position="right" withArrow offset={6} openDelay={200}>
              <UnstyledButton
                component={Link}
                to={homePath}
                onClick={close}
                w="100%"
                h={40}
                display="flex"
                style={{ alignItems: "center", justifyContent: "center", borderRadius: 8 }}
                aria-label={brandHomeAriaLabel}
                title="Back to dashboard"
                styles={{
                  root: {
                    border: "1px solid var(--mantine-color-default-border)",
                    transition: "background 0.15s ease",
                    "&:hover": { background: "var(--mantine-color-default-hover)" },
                    "&:focusVisible": { outline: "2px solid var(--accent)", outlineOffset: 2 },
                  },
                }}
              >
                <AppLogo variant="mark" size="md" color="var(--accent)" />
              </UnstyledButton>
            </Tooltip>
          ) : (
            <Link
              className="app-nav-brand app-nav-brand--has-logo"
              to={homePath}
              onClick={close}
              title="Back to dashboard"
            >
              <AppLogo variant="full" size="md" color="var(--accent)" />
            </Link>
          )}
        </div>

        <ScrollArea
          type="auto"
          style={{
            flex: 1,
            marginLeft: -4,
            marginRight: -4,
            paddingTop: showIconRail ? 2 : 0,
          }}
        >
          {showHelmCore && (
            <>
              {!showIconRail && (
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" pl="md" mb={6} mt={4}>
                  Work
                </Text>
              )}
              <AppNavItem
                to="/"
                label="Dashboard"
                leftSection={<IconLayoutDashboard {...iconProps} />}
                onClick={close}
                active={navActive("/", { end: true })}
                showIconRail={showIconRail}
                color={primary}
                mb={4}
              />
              <AppNavItem
                to="/triage/new"
                label="New item"
                leftSection={<IconPlus {...iconProps} />}
                onClick={close}
                active={navActive("/triage/new", { end: true })}
                showIconRail={showIconRail}
                color={primary}
                mb={4}
              />
              <AppNavItem
                to="/priority"
                label="Blockers & risk"
                leftSection={<IconAlertTriangle {...iconProps} />}
                onClick={close}
                active={navActive("/priority", { end: true })}
                showIconRail={showIconRail}
                color="orange"
                mb={4}
              />
              <AppNavItem
                to="/standup"
                label="Check-in"
                leftSection={<IconCalendar {...iconProps} />}
                onClick={close}
                active={navActive("/standup", { end: true })}
                showIconRail={showIconRail}
                color="teal"
                mb={4}
              />
              <AppNavItem
                to="/decisions"
                label="Decisions"
                leftSection={<IconScale {...iconProps} />}
                onClick={close}
                active={navActive("/decisions", { end: true })}
                showIconRail={showIconRail}
                color="indigo"
                mb="lg"
              />

              {!showIconRail && (
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" pl="md" mb={6}>
                  Programs
                </Text>
              )}
              {showIconRail && <Box mb={4} />}
              <AppNavItem
                to="/expenses"
                label="Expenses"
                leftSection={<IconReceipt2 {...iconProps} />}
                onClick={close}
                active={navActive("/expenses", { prefix: true })}
                showIconRail={showIconRail}
                color={primary}
                mb={4}
              />
              <AppNavItem
                to="/planning"
                label="Planning"
                leftSection={<IconTimelineEvent {...iconProps} />}
                onClick={close}
                active={navActive("/planning", { prefix: true })}
                showIconRail={showIconRail}
                color={primary}
                mb={4}
              />
              <AppNavItem
                to="/developers"
                label="Dev management"
                leftSection={<IconUsers {...iconProps} />}
                onClick={close}
                active={navActive("/developers", { prefix: true })}
                showIconRail={showIconRail}
                color={primary}
                mb={4}
              />
              <AppNavItem
                to="/team-management"
                label="Team management"
                leftSection={<IconUsersGroup {...iconProps} />}
                onClick={close}
                active={navActive("/team-management", { end: true })}
                showIconRail={showIconRail}
                color={primary}
                mb="lg"
              />

              {!showIconRail && (
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" pl="md" mb={6}>
                  Apps
                </Text>
              )}
              {showIconRail && <Box mb={4} />}
              {user.role === "lead" && (
                <AppNavItem
                  to="/apps/registration"
                  label="App registration"
                  leftSection={<IconIdBadge2 {...iconProps} />}
                  onClick={close}
                  active={navActive("/apps/registration", { end: true })}
                  showIconRail={showIconRail}
                  color={primary}
                  mb={4}
                />
              )}
              <AppNavItem
                to="/apps"
                label="All apps"
                leftSection={<IconLayoutGrid {...iconProps} />}
                onClick={close}
                active={navActive("/apps", { end: true })}
                showIconRail={showIconRail}
                color={primary}
                mb={4}
              />
              <AppNavItem
                to="/apps/outlook"
                label="Outlook"
                leftSection={<IconMail {...iconProps} />}
                onClick={close}
                active={navActive("/apps/outlook", { prefix: true })}
                showIconRail={showIconRail}
                color={primary}
                mb={4}
              />
              <AppNavItem
                to="/apps/todo"
                label="Microsoft To Do"
                leftSection={<IconListCheck {...iconProps} />}
                onClick={close}
                active={navActive("/apps/todo", { prefix: true })}
                showIconRail={showIconRail}
                color={primary}
                mb={4}
              />
            </>
          )}

          {showForge && (
            <>
              {!showIconRail && (
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" pl="md" mb={6} mt={showHelmCore ? 0 : 4}>
                  Forge
                </Text>
              )}
              {showIconRail && <Box mb={4} />}
              <AppNavItem
                to="/forge"
                label="Forge dashboard"
                leftSection={<IconHammer {...iconProps} />}
                onClick={close}
                active={navActive("/forge", { end: true })}
                showIconRail={showIconRail}
                color="grape"
                mb={4}
              />
              <AppNavItem
                to="/forge/builds"
                label="Builds"
                leftSection={<IconList {...iconProps} />}
                onClick={close}
                active={navActive("/forge/builds", { prefix: true })}
                showIconRail={showIconRail}
                color="grape"
                mb={4}
              />
              <AppNavItem
                to="/forge/builds/new"
                label="Request build"
                leftSection={<IconPlus {...iconProps} />}
                onClick={close}
                active={navActive("/forge/builds/new", { end: true })}
                showIconRail={showIconRail}
                color="grape"
                mb={4}
              />
              {showForgeAdmin && (
                <AppNavItem
                  to="/forge/admin"
                  label="Forge admin"
                  leftSection={<IconSettings {...iconProps} />}
                  onClick={close}
                  active={navActive("/forge/admin", { end: true })}
                  showIconRail={showIconRail}
                  color="grape"
                  mb={4}
                />
              )}
            </>
          )}
        </ScrollArea>

        <Box
          pt="md"
          style={{ borderTop: "1px solid var(--mantine-color-default-border, rgba(0,0,0,0.08))" }}
        >
          {showIconRail ? (
            <>
              <Box mb="sm" style={{ display: "flex", justifyContent: "center" }}>
                <Tooltip
                  position="right"
                  withArrow
                  offset={8}
                  maw={280}
                  multiline
                  label={
                    <Stack gap={2}>
                      <Text size="sm" fw={600}>
                        {user.displayName ?? user.email}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {user.email}
                      </Text>
                    </Stack>
                  }
                >
                  <UnstyledButton
                    component={Link}
                    to="/profile"
                    onClick={close}
                    p={0}
                    style={{ lineHeight: 0, background: "transparent" }}
                    aria-label={`Open your profile, ${user.displayName ?? user.email}`}
                  >
                    <Avatar radius="xl" color={primary} size="md" variant="light">
                      {userInitials(user)}
                    </Avatar>
                  </UnstyledButton>
                </Tooltip>
              </Box>
              <Tooltip label="Sign out" position="right" withArrow offset={6} openDelay={200}>
                <UnstyledButton
                  type="button"
                  w="100%"
                  p={0}
                  style={{
                    minHeight: 48,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    border: "1px solid var(--mantine-color-default-border)",
                    transition: "background 0.15s ease, border-color 0.15s ease",
                  }}
                  styles={{
                    root: {
                      "&:hover": {
                        background: "color-mix(in srgb, var(--color-surface) 90%, var(--accent) 10%)",
                        borderColor: "var(--color-border-strong)",
                      },
                      "&:focusVisible": { outline: "2px solid var(--accent)", outlineOffset: 2 },
                    },
                  }}
                  onClick={onLogout}
                  aria-label="Sign out"
                >
                  <IconLogout size={20} stroke={1.5} style={{ color: "var(--mantine-color-dimmed)" }} />
                </UnstyledButton>
              </Tooltip>
            </>
          ) : (
            <>
              <UnstyledButton
                component={Link}
                to="/profile"
                onClick={close}
                w="100%"
                mb="sm"
                p={0}
                style={{ textAlign: "left", background: "transparent" }}
                aria-label="Open your profile"
              >
                <Group wrap="nowrap" gap="sm">
                  <Avatar radius="xl" color={primary} size="md" variant="light">
                    {userInitials(user)}
                  </Avatar>
                  <Box style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={600} lineClamp={1} title={user.displayName ?? user.email}>
                      {user.displayName ?? user.email}
                    </Text>
                    <Text size="xs" c="dimmed" lineClamp={1} title={user.email}>
                      {user.email}
                    </Text>
                  </Box>
                </Group>
              </UnstyledButton>
              <UnstyledButton
                type="button"
                w="100%"
                p="sm"
                style={{
                  minHeight: 48,
                  borderRadius: 8,
                  border: "1px solid var(--mantine-color-default-border)",
                  transition: "background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                }}
                styles={{
                  root: {
                    "&:hover": {
                      background: "color-mix(in srgb, var(--color-surface) 90%, var(--accent) 10%)",
                      borderColor: "var(--color-border-strong)",
                    },
                    "&:focusVisible": {
                      outline: "2px solid var(--accent)",
                      outlineOffset: 2,
                    },
                  },
                }}
                onClick={onLogout}
                aria-label="Sign out"
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="sm" fw={600} c="dimmed">
                    Sign out
                  </Text>
                  <IconLogout size={18} stroke={1.5} style={{ color: "var(--mantine-color-dimmed)" }} />
                </Group>
              </UnstyledButton>
            </>
          )}
        </Box>
      </AppShell.Navbar>

      <AppShell.Main id="main-content" style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Box
          className="app-main-pad"
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
            paddingLeft: "max(0px, env(safe-area-inset-left, 0px))",
            paddingRight: "max(0px, env(safe-area-inset-right, 0px))",
          }}
        >
          <Group
            className="app-top-bar"
            justify="space-between"
            align="center"
            wrap="wrap"
            gap="sm"
            w="100%"
            style={{ rowGap: "0.5rem", flexShrink: 0 }}
          >
            <Group gap="sm" align="center" wrap="nowrap" style={{ minWidth: 0 }}>
              <Burger
                hiddenFrom="sm"
                opened={mobileOpen}
                onClick={toggle}
                size="md"
                aria-label="Open navigation"
                style={{ minWidth: 48, minHeight: 48 }}
              />
              <Box display={{ base: "none", sm: "block" }} style={{ lineHeight: 0 }}>
                <ActionIcon
                  type="button"
                  variant="default"
                  size="lg"
                  radius="md"
                  title={navDesktopCollapsed ? "Expand navigation" : "Collapse navigation"}
                  onClick={toggleNavDesktopCollapsed}
                  aria-expanded={!navDesktopCollapsed}
                  aria-controls="app-shell-navbar"
                  aria-label={navDesktopCollapsed ? "Expand navigation" : "Collapse navigation"}
                >
                  {navDesktopCollapsed ? (
                    <IconLayoutSidebarLeftExpand size={20} stroke={1.5} />
                  ) : (
                    <IconLayoutSidebarLeftCollapse size={20} stroke={1.5} />
                  )}
                </ActionIcon>
              </Box>
              <Text component="p" className="app-top-bar__eyebrow" m={0} display={{ base: "none", sm: "block" }}>
                Workspace
              </Text>
            </Group>
            <Group gap="xs" wrap="nowrap" style={{ marginLeft: "auto", minWidth: 0 }} justify="flex-end">
              <GlobalSearchTrigger />
              <ThemeSwitcher />
            </Group>
          </Group>
          <Box className="app-layout-main-inner" maw={1200} mx="auto" w="100%" style={{ minWidth: 0 }}>
            {children}
          </Box>
          <Box component="footer" className="app-footer app-footer--shell" mt="xl">
            {brandFooterLine}
          </Box>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
