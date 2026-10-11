import { Color3, Constants, Mesh, StandardMaterial, Vector3, VertexBuffer, type AbstractMesh, type Scene } from "@babylonjs/core";
import { createCausticTexture } from "../world/textures";
import { WATER_LEVEL } from "../world/terrain";

/**
 * Animated sunlight caustics on the shallow sea floor (handoff §19): copies of the
 * underwater terrain drawn additively with two scrolling caustic patterns, masked
 * by depth through vertex colours (none on dry sand, strongest knee-deep, fading
 * towards deep water). Rendered before the water surface.
 */
export function createCaustics(scene: Scene, terrain: AbstractMesh[]) {
  const layers = [
    { tex: createCausticTexture(scene, 11), scale: 1 / 1.7, speed: [0.018, 0.011] },
    { tex: createCausticTexture(scene, 23), scale: 1 / 2.3, speed: [-0.012, 0.016] },
  ];
  const meshes: Mesh[] = [];

  layers.forEach((layer, li) => {
    const mat = new StandardMaterial(`caustics${li}`, scene);
    mat.disableLighting = true;
    mat.emissiveTexture = layer.tex;
    mat.emissiveColor = new Color3(0.16, 0.2, 0.19);
    mat.alphaMode = Constants.ALPHA_ADD;
    mat.alpha = 0.999; // forces the transparent pass so alphaIndex ordering applies
    mat.fogEnabled = false;
    mat.zOffset = -2;
    mat.disableDepthWrite = true;
    layer.tex.coordinatesIndex = 0;

    for (const src of terrain) {
      if (!(src instanceof Mesh)) continue;
      const m = src.clone(`${src.name}_caustics${li}`, src.parent, true, false) as Mesh;
      m.makeGeometryUnique();
      const world = src.computeWorldMatrix(true);
      const pos = m.getVerticesData(VertexBuffer.PositionKind)!;
      const count = pos.length / 3;
      const uvs = new Float32Array(count * 2);
      const colors = new Float32Array(count * 4);
      const p = new Vector3();
      let any = false;
      for (let i = 0; i < count; i++) {
        Vector3.TransformCoordinatesFromFloatsToRef(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], world, p);
        uvs[i * 2] = p.x * layer.scale;
        uvs[i * 2 + 1] = p.z * layer.scale;
        const d = WATER_LEVEL - p.y;
        const k = d <= 0.03 ? 0 : Math.min(1, (d - 0.03) / 0.35) * (d < 1.5 ? 1 : Math.max(0.25, 1 - (d - 1.5) / 4));
        if (k > 0) any = true;
        colors.set([k, k, k, 1], i * 4);
      }
      if (!any) {
        m.dispose();
        continue;
      }
      m.setVerticesData(VertexBuffer.UVKind, uvs);
      m.setVerticesData(VertexBuffer.ColorKind, colors);
      m.removeVerticesData(VertexBuffer.UV2Kind);
      m.material = mat;
      m.receiveShadows = false;
      m.isPickable = false;
      m.alphaIndex = 5; // the water surface uses 10
      meshes.push(m);
    }
  });

  return {
    meshes,
    update(t: number) {
      for (const l of layers) {
        l.tex.uOffset = t * l.speed[0];
        l.tex.vOffset = t * l.speed[1];
      }
    },
  };
}
