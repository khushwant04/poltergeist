import { useEffect, useState } from "react";
import type { CatalogEntry } from "@poltergeist/core";
import { loadCatalog } from "../api.js";
import { HAUNTING_LABEL } from "../view-models/labels.js";
import { Loading } from "./common.js";

const FAMILY = { injection: "Injection", schema: "Schema", timing: "Timing", data: "Data" } as Record<string, string>;

export function CataloguePage() {
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  useEffect(() => {
    void loadCatalog().then(setCatalog);
  }, []);
  if (!catalog) return <Loading what="the catalogue" />;
  return (
    <div className="page">
      <section className="hero">
        <h1>Hauntings</h1>
        <p className="lede">
          What Poltergeist can do to an agent's tools. Every haunting is generated from a seed, so a failure can always be reproduced and shrunk.
        </p>
      </section>
      <ul className="catalogue">
        {catalog.map((h) => (
          <li key={h.id} className={`haunting-card chip-${h.id}`}>
            <p className="eyebrow">{FAMILY[h.family] ?? h.family}</p>
            <h2>
              {HAUNTING_LABEL[h.id]?.name ?? h.id} <span className="muted small">· {HAUNTING_LABEL[h.id]?.plain}</span>
            </h2>
            <p>{h.summary}</p>
            <p className="tests">{h.tests}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
