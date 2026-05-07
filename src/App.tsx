import { useEffect, useState } from "react";
import { BootstrapScreen } from "./features/bootstrap/BootstrapScreen";
import { getBootstrapStatus } from "./lib/tauriClient/bootstrap";
import "./styles/global.css";

function App() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    getBootstrapStatus()
      .then(setStatus)
      .catch(() => setStatus("tauri-command-unavailable"));
  }, []);

  return <BootstrapScreen status={status} />;
}

export default App;
