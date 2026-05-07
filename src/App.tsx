import { Play, Server, Sparkles, TvMinimal } from "lucide-react";
import { useEffect, useState } from "react";
import "./App.css";
import { getBootstrapStatus } from "./lib/bootstrapClient";

const pillars = [
  {
    icon: Server,
    title: "Emby-first provider",
    body: "Manual server URL, username/password login, library browsing, and progress sync are the V1 path.",
  },
  {
    icon: TvMinimal,
    title: "Native mpv playback",
    body: "Playback will be owned by Rust services and a native mpv window, with React subscribing to session state.",
  },
  {
    icon: Sparkles,
    title: "System material shell",
    body: "Windows uses Mica/Acrylic where available; macOS targets public Liquid Glass and vibrancy capabilities.",
  },
];

function App() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    getBootstrapStatus()
      .then(setStatus)
      .catch(() => setStatus("tauri-command-unavailable"));
  }, []);

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="status-pill">{status}</span>
          <h1>Lumi</h1>
          <p>
            A Tauri media aggregation client for a calm, native-feeling desktop
            viewing experience.
          </p>
          <div className="actions" aria-label="Project starting points">
            <span>Product vision</span>
            <span>Architecture</span>
          </div>
        </div>
        <div className="preview-panel" aria-label="Lumi playback preview">
          <div className="preview-toolbar">
            <span />
            <span />
            <span />
          </div>
          <div className="poster-grid">
            <div className="poster poster-tall" />
            <div className="poster poster-wide" />
            <div className="poster poster-small" />
          </div>
          <div className="playback-strip">
            <button type="button" aria-label="Playback preview">
              <Play size={18} fill="currentColor" />
            </button>
            <div>
              <strong>Continue Watching</strong>
              <span>Provider and player services are ready to be wired.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="pillar-grid" aria-label="Startup architecture pillars">
        {pillars.map((pillar) => (
          <article className="pillar" key={pillar.title}>
            <pillar.icon size={22} />
            <h2>{pillar.title}</h2>
            <p>{pillar.body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

export default App;
