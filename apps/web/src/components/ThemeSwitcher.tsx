import { ActionIcon, Group, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconMoon, IconSun } from "@tabler/icons-react";
import { useAppTheme } from "../theme/AppThemeContext";
import { THEME_PRESETS, type AppThemeId } from "../theme/presets";

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { themeId, setThemeId, preset, colorScheme, toggleColorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";

  return (
    <div className="theme-switcher" role="group" aria-label="Appearance">
      {!compact && (
        <Text size="xs" fw={700} tt="uppercase" c="dimmed" className="theme-switcher__label">
          Theme
        </Text>
      )}
      <Group gap={6} wrap="nowrap" className="theme-switcher__row">
        <Group gap={6} wrap="nowrap" className="theme-switcher__swatches">
          {THEME_PRESETS.map((p) => {
            const active = p.id === themeId;
            return (
              <Tooltip
                key={p.id}
                label={
                  <span>
                    <strong>{p.label}</strong> — {p.description}
                  </span>
                }
                position="bottom"
                withArrow
              >
                <UnstyledButton
                  type="button"
                  onClick={() => setThemeId(p.id as AppThemeId)}
                  className={`theme-swatch${active ? " theme-swatch--active" : ""}`}
                  style={{ background: p.swatch }}
                  aria-pressed={active}
                  aria-label={`${p.label} theme. ${p.description}`}
                />
              </Tooltip>
            );
          })}
        </Group>
        <Tooltip label={isDark ? "Switch to light mode" : "Switch to dark mode"} position="bottom" withArrow>
          <ActionIcon
            variant="default"
            size={compact ? "md" : "lg"}
            radius="md"
            onClick={toggleColorScheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={isDark}
            className="theme-scheme-toggle"
          >
            {isDark ? <IconSun size={18} stroke={1.5} /> : <IconMoon size={18} stroke={1.5} />}
          </ActionIcon>
        </Tooltip>
      </Group>
      {!compact && (
        <Text size="xs" c="dimmed" className="theme-switcher__current" data-active-theme={themeId}>
          {preset.shortLabel} · {isDark ? "Dark" : "Light"}
        </Text>
      )}
    </div>
  );
}
