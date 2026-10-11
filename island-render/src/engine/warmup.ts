import { Mesh, type ShadowGenerator, type Scene } from "@babylonjs/core";

/**
 * Compiles every material for every mesh up front, including LOD levels that are still hidden,
 * plus the shadow pass. Without this the first frame a detail level comes into view stalls
 * while its shader compiles (seen as hitches in the benchmark orbit).
 */
export async function precompileShaders(scene: Scene, shadows: ShadowGenerator) {
  const jobs: Promise<void>[] = [];
  for (const mesh of scene.meshes) {
    if (!mesh.material || mesh.getTotalVertices() === 0) continue;
    const useInstances = mesh instanceof Mesh && mesh.hasThinInstances;
    jobs.push(mesh.material.forceCompilationAsync(mesh, { useInstances }).catch(() => undefined));
  }
  jobs.push(shadows.forceCompilationAsync().catch(() => undefined));
  await Promise.all(jobs);
}
