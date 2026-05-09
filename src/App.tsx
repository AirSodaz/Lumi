import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { MotionConfig } from "motion/react";
import { HashRouter } from "react-router";
import { PlayerWindowView } from "./features/player/PlayerWindowView";
import { LumiShell } from "./features/shell/LumiShell";
import { I18nProvider } from "./lib/i18n";
import { ThemeProvider } from "./lib/theme";
import "./styles/global.css";

function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  const route = getAppRoute();

  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <I18nProvider>
            {route.view === "player" ? (
              <PlayerWindowView controlsOnly={route.controlsOnly} sessionId={route.sessionId} />
            ) : (
              <HashRouter>
                <LumiShell />
              </HashRouter>
            )}
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}

function getAppRoute() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "player") {
    return {
      view: "player" as const,
      controlsOnly: params.get("surface") === "controls",
      sessionId: params.get("sessionId") ?? "",
    };
  }

  return { controlsOnly: false, view: "shell" as const };
}

export default App;
