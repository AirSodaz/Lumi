import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
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
      <LumiShell />
    </QueryClientProvider>
  );
}

export default App;
