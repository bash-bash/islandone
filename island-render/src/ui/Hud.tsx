import { useSyncExternalStore } from "react";
import { statsStore } from "../engine/stats";

/** Debug HUD over the canvas (handoff §23: HTML/CSS, not 3D UI). */
export function Hud() {
  const s = useSyncExternalStore(statsStore.subscribe, statsStore.get);
  const loading = !s.ready && !s.error;

  return (
    <>
      <div className="hud-panel hud-stats">
        <div className="hud-title">IslandOne · Strandtest</div>
        <div className="hud-row">
          <span>Renderer</span>
          <b>{s.renderer}</b>
        </div>
        <div className="hud-row">
          <span>FPS</span>
          <b className={s.fps < 30 ? "warn" : ""}>{s.fps}</b>
        </div>
        <div className="hud-row">
          <span>Draw Calls</span>
          <b>{s.drawCalls}</b>
        </div>
        <div className="hud-row">
          <span>Dreiecke</span>
          <b>{s.triangles.toLocaleString("de-DE")}</b>
        </div>
        <div className="hud-row">
          <span>Assets</span>
          <b>
            {s.assetsLoaded}/{s.assetsTotal}
          </b>
        </div>
      </div>

      {loading && <div className="hud-panel hud-loading">Lade Assets … {s.assetsLoaded}/{s.assetsTotal}</div>}
      {s.error && <div className="hud-panel hud-error">Fehler: {s.error}</div>}

      <div className="hud-panel hud-help">
        Klick auf Sand: Charakter laufen lassen · Linke Maustaste: drehen · Rechte Maustaste: verschieben · Mausrad: zoomen
      </div>
    </>
  );
}
