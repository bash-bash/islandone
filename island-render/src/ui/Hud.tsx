import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { cameraRigRef } from "../engine/camera";
import { switchQuality, type QualityLevel } from "../engine/quality";
import { statsStore, type RenderStats } from "../engine/stats";
import { figureStore, startFigureStub, type Need, type Slot } from "./figureState";
import {
  AxeIcon,
  BoltIcon,
  CheckBox,
  DropIcon,
  FoodIcon,
  GearIcon,
  HeartIcon,
  HomeIcon,
  LeafIcon,
  LogIcon,
  PlankIcon,
  StoneIcon,
  SunIcon,
  TorchIcon,
} from "./icons";

// Observer HUD after the reference image "Tropisches Inselcamp am Strand" (handoff §23:
// HTML/CSS over the canvas, not 3D UI). The viewer watches the figure, so everything here
// shows its state; nothing is clickable except the settings button.
// Render stats and camera help live behind the settings button (open by default with ?debug).

const NEED_ICON: Record<Need["id"], ReactNode> = {
  health: <HeartIcon />,
  food: <FoodIcon />,
  water: <DropIcon />,
  energy: <BoltIcon />,
};
const NEED_LABEL: Record<Need["id"], string> = { health: "Gesundheit", food: "Hunger", water: "Durst", energy: "Energie" };

const SLOT_ICON: Record<Slot["item"], ReactNode> = {
  axe: <AxeIcon size={46} />,
  torch: <TorchIcon size={46} />,
  log: <LogIcon size={46} />,
  plank: <PlankIcon size={46} />,
  leaf: <LeafIcon size={42} />,
  stone: <StoneIcon size={44} />,
};

const QUALITY_LABEL: Record<QualityLevel, string> = { low: "Niedrig", medium: "Mittel", high: "Hoch" };

const clock = (minuteOfDay: number) => {
  const m = Math.floor(minuteOfDay);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function memoryText(m: RenderStats["memory"]) {
  if (!m) return "…";
  const gpu = `GPU ~${m.gpuMB} MB`;
  return m.jsHeapMB !== undefined ? `JS ${m.jsHeapMB} MB · ${gpu}` : gpu;
}

export function Hud() {
  const s = useSyncExternalStore(statsStore.subscribe, statsStore.get);
  const f = useSyncExternalStore(figureStore.subscribe, figureStore.get);
  const [settings, setSettings] = useState(() => new URLSearchParams(location.search).has("debug"));
  const loading = !s.ready && !s.error;

  useEffect(() => startFigureStub(), []);

  const focusEvent = () => {
    const at = figureStore.get().discovery?.at;
    if (at) cameraRigRef.current?.focus(at.x, at.z, at.lift);
  };

  // R / Pos1: Reset View, F: Focus Event (the latest discovery).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "r" || e.key === "R" || e.key === "Home") cameraRigRef.current?.reset();
      else if (e.key === "f" || e.key === "F") focusEvent();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="hud-panel hud-clock">
        <SunIcon />
        <span>Tag {f.day}</span>
        <span>{clock(f.minuteOfDay)}</span>
      </div>

      <div className="hud-panel hud-needs">
        {f.needs.map((n) => (
          <div key={n.id} className="hud-need" title={NEED_LABEL[n.id]}>
            {NEED_ICON[n.id]}
            <div className="hud-bar">
              <div className={`hud-bar-fill need-${n.id}`} style={{ width: `${n.value}%` }} />
            </div>
            <b>{Math.round(n.value)}</b>
          </div>
        ))}
      </div>

      <div className="hud-topright">
        <div className="hud-panel hud-resources">
          <span title="Holz">
            <LogIcon /> {f.resources.wood}
          </span>
          <span title="Stein">
            <StoneIcon /> {f.resources.stone}
          </span>
          <span title="Fasern">
            <LeafIcon /> {f.resources.fiber}
          </span>
        </div>
        <button className="hud-panel hud-gear" onClick={() => cameraRigRef.current?.reset()} aria-label="Ansicht zurücksetzen" title="Ansicht zurücksetzen (R)">
          <HomeIcon />
        </button>
        <button className="hud-panel hud-gear" onClick={() => setSettings((v) => !v)} aria-label="Einstellungen">
          <GearIcon />
        </button>
      </div>

      <div className="hud-panel hud-goals">
        <div className="hud-goals-title">{f.goalsTitle}</div>
        {f.goals.map((g) => (
          <div key={g.label} className={`hud-goal${g.done >= g.of ? " done" : ""}`}>
            <CheckBox checked={g.done >= g.of} />
            <span>{g.label}</span>
            <b>
              {g.done}/{g.of}
            </b>
          </div>
        ))}
      </div>

      {f.discovery && (
        <div className="hud-panel hud-discovery" onClick={focusEvent} role="button" title="Hinsehen (F)">
          <img src={import.meta.env.BASE_URL + "ui/discovery_seagull.png"} alt="" />
          <div>
            <div className="hud-discovery-title">{f.discovery.title}</div>
            <div>{f.discovery.text}</div>
          </div>
        </div>
      )}

      <div className="hud-belt">
        {f.belt.map((slot, i) => (
          <div key={i} className={`hud-slot${i === f.selectedSlot ? " selected" : ""}`}>
            <span className="hud-slot-key">{i + 1}</span>
            {SLOT_ICON[slot.item]}
            {slot.count !== undefined && <span className="hud-slot-count">{slot.count}</span>}
          </div>
        ))}
      </div>

      <div className={`hud-panel hud-stats${settings ? "" : " hidden"}`}>
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
        <div className="hud-row">
          <span>Speicher</span>
          <b>{memoryText(s.memory)}</b>
        </div>
        <div className="hud-row">
          <span>Qualität</span>
          <span className="hud-quality">
            {(["low", "medium", "high"] as const).map((q) => (
              <button key={q} className={q === s.quality ? "active" : ""} onClick={() => q !== s.quality && switchQuality(q)}>
                {QUALITY_LABEL[q]}
              </button>
            ))}
          </span>
        </div>
        {s.bench && (
          <div className="hud-row hud-bench">
            <span>Benchmark</span>
            <b>
              {s.bench === "running"
                ? "läuft …"
                : `Ø ${s.bench.avgFps} FPS · 1 % ${s.bench.low1Fps} · p95 ${s.bench.p95FrameMs} ms · Ruckler ${s.bench.hitches} (max ${s.bench.maxFrameMs} ms)`}
            </b>
          </div>
        )}
        <div className="hud-help">
          Linke Maustaste: drehen · Rechte: verschieben · Mausrad: zoomen · R: Ansicht zurück · F: zum Ereignis
        </div>
      </div>

      {loading && <div className="hud-panel hud-loading">Lade Assets … {s.assetsLoaded}/{s.assetsTotal}</div>}
      {s.error && <div className="hud-panel hud-error">Fehler: {s.error}</div>}
    </>
  );
}
