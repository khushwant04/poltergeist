import { useEffect, useState } from "react";
import { CataloguePage } from "./components/CataloguePage.js";
import { Ghost } from "./components/Ghost.js";
import { RunPage } from "./components/RunPage.js";
import { RunsPage } from "./components/RunsPage.js";

type Route = { page: "runs" } | { page: "run"; runId: string } | { page: "catalogue" };

function parse(hash: string): Route {
  const h = hash.replace(/^#/, "");
  if (h.startsWith("run-")) return { page: "run", runId: h.slice(4) };
  if (h === "catalogue") return { page: "catalogue" };
  return { page: "runs" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo({ top: 0 });
    };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <a className="brand" href="#runs">
          <Ghost size={26} />
          <span className="brand-name">Poltergeist</span>
          <span className="brand-sub">Séance Room</span>
        </a>
        <nav aria-label="Main">
          <a href="#runs" aria-current={route.page !== "catalogue" ? "page" : undefined}>Runs</a>
          <a href="#catalogue" aria-current={route.page === "catalogue" ? "page" : undefined}>Hauntings</a>
          <a href="https://github.com/khushwant04/poltergeist" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {route.page === "runs" && <RunsPage />}
        {route.page === "run" && <RunPage key={route.runId} runId={route.runId} />}
        {route.page === "catalogue" && <CataloguePage />}
      </main>
      <footer className="footer">
        Poltergeist haunts agents on purpose, in a test world: every attack targets planted canaries and <code>.invalid</code> addresses.
      </footer>
    </>
  );
}
