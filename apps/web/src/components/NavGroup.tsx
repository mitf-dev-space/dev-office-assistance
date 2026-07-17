import { useId, type ReactNode } from "react";
import { Box, Collapse, Group, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown } from "@tabler/icons-react";

type NavGroupProps = {
  id: string;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  /** When true (icon rail), children render flat without the accordion chrome. */
  flatten: boolean;
  children: ReactNode;
  active?: boolean;
};

export function NavGroup({
  id,
  label,
  expanded,
  onToggle,
  flatten,
  children,
  active = false,
}: NavGroupProps) {
  const panelId = useId();

  if (flatten) {
    return <Box mb={4}>{children}</Box>;
  }

  return (
    <Box className="app-nav-group" data-active={active || undefined} mb="xs">
      <UnstyledButton
        type="button"
        className="app-nav-group__toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        data-group={id}
        w="100%"
      >
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.04em" }}>
            {label}
          </Text>
          <IconChevronDown
            size={14}
            stroke={2}
            className="app-nav-group__chevron"
            data-expanded={expanded || undefined}
            aria-hidden
          />
        </Group>
      </UnstyledButton>
      <Collapse in={expanded} id={panelId}>
        <Box
          className="app-nav-group__items"
          pt={4}
          aria-hidden={!expanded}
          // Prevent focus into collapsed accordion panels (a11y).
          {...(!expanded ? { inert: true } : {})}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
