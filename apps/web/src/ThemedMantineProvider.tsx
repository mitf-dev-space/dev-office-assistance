import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { useAppTheme } from "./theme/AppThemeContext";

export function ThemedMantineProvider({ children }: { children: ReactNode }) {
  const { mantineTheme, colorScheme } = useAppTheme();
  return (
    <MantineProvider theme={mantineTheme} forceColorScheme={colorScheme}>
      {children}
    </MantineProvider>
  );
}
