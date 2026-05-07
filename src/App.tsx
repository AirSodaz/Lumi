import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
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

  return (
    <QueryClientProvider client={queryClient}>
      {isPlayerWindow() ? <PlayerWindowView /> : <LumiShell />}
    </QueryClientProvider>
  );
}

export default App;

function isPlayerWindow() {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("playerWindow") === "1"
  );
}
