import "./ui/hud.css";
import { createRoot } from "react-dom/client";
import { startIsland } from "./engine/startIsland";
import { statsStore } from "./engine/stats";
import { Hud } from "./ui/Hud";

createRoot(document.getElementById("hud")!).render(<Hud />);

startIsland(document.getElementById("renderCanvas") as HTMLCanvasElement).catch((err) => {
  console.error(err);
  statsStore.set({ error: String(err) });
});
