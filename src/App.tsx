import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { MotionConfig } from "motion/react";
import { PlayerWindowView } from "./features/player/PlayerWindowView";
import { LumiShell } from "./features/shell/LumiShell";
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
        {route.view === "player" ? (
          <PlayerWindowView sessionId={route.sessionId} />
        ) : (
          <LumiShell />
        )}
      </QueryClientProvider>
    </MotionConfig>
  );
}

function getAppRoute() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "player") {
    return {
      view: "player" as const,
      sessionId: params.get("sessionId") ?? "",
    };
  }

  return { view: "shell" as const };
}

export default App;
