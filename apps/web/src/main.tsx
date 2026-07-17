import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import "@mantine/core/styles.css";
import { AuthProvider } from "./auth/AuthContext";
import App from "./App";
import { AppThemeProvider } from "./theme/AppThemeContext";
import { ThemedMantineProvider } from "./ThemedMantineProvider";
import "./index.css";
import "./theme/theme-color-scopes.css";
import "./theme/theme-dark-scopes.css";
import "./theme/ThemeSwitcher.css";
import "./mobile.css";

if (import.meta.env.PROD) {
  registerSW({ immediate: true });
} else if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppThemeProvider>
      <ThemedMantineProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter basename={routerBasename || undefined}>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </AuthProvider>
      </ThemedMantineProvider>
    </AppThemeProvider>
  </StrictMode>,
);
