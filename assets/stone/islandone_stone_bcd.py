"""
IslandOne - small loose stones B, C, D (Blender 5.2, also runs as the bpy package)

Builds IO_Stone_Small_B (round cobble), IO_Stone_Small_C (flat disc stone) and
IO_Stone_Small_D (jagged broken stone with one fresh fracture face and a sharp
edge): the `stones` of island-sim (shape round / flat / jagged). Same rock
family as IO_Stone_Small_A and IO_Rock_Large_A/B: same construction (hull with
plane cuts, voxel remesh, gentle erosion), same procedural rock shader and
palette, same material IO_MAT_Rock_Gray, authored at the same BUILD_SCALE as
IO_Stone_Small_A so the surface detail has the same real size.
Per variant: LOD0-LOD2 with baked Base Color / Roughness / Normal, a convex
collision proxy under 16 triangles, sockets GRIP, BIND (and EDGE on C and D),
one GLB. Every GLB is re-imported into an empty scene and checked, a manifest
(stone_bcd.json) is written and, with --render, QA, reference, socket and
context renders are made.

Run headless:
    blender --background --python islandone_stone_bcd.py -- --out . --render \
        --ref refs/IO_Stone_Small_BCD.png --assets ..
    # or: pip install bpy==5.2.2 && python3 islandone_stone_bcd.py --out . --render ...
--assets is the folder that holds rock/, stone/ and terrain/ (read only, for the
family and context renders). --samples N sets render samples (default 64).

Conventions (same as IO_Stone_Small_A, see README_BCD.md):
- Blender is Z-up, metres. The glTF exporter converts to Y-up for Babylon.
- Origin at the footprint centre on ground level; the underside reaches EMBED
  below ground so a stone never floats on uneven sand.
- Long axis +X. C and D: the cutting edge is at the front (+Y), the thick back
  at -Y. Sockets are empties SOCKET_<NAME>; local +Z (glTF +Y) is the socket
  normal, local +X the socket's "along" direction (see SOCKETS below).
- Material IO_MAT_Rock_Gray. Wetness is a runtime effect (darker base colour,
  lower roughness), not a separate mesh or texture.
"""

import bpy
import bmesh
import json
import math
import os
import random
import struct
import sys
import numpy as np
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

FAMILY = "IO_Stone_Small"
KIT_ID = "stone_v1"
MATERIAL_NAME = "IO_MAT_Rock_Gray"
BUILD_SCALE = 6.0                   # same as IO_Stone_Small_A: shader detail has the same real size
EMBED = 0.004                       # metres below ground (real size)
EMBED_B = EMBED * BUILD_SCALE
VOXEL = 0.026                       # build units (4.3 mm real)
COLLIDER_MAX_TRIS = 16
COPYRIGHT = "IslandOne. Eigene Erstellung, keine Fremd-Assets."
CREDITS = {
    "author": "IslandOne",
    "origin": "original, created in-house with islandone_stone_bcd.py",
    "third_party_assets": False,
    "references": "concept image IO_Stone_Small_BCD (studio sheet), IO_Stone_Small_A, IO_Rock_Large_A/B, "
                  "IslandOne beach camp image; visual reference only",
}
WET = {"base_color_multiplier": 0.6, "roughness": 0.3, "note": "runtime only, nothing baked"}


def srgb(r, g, b):
    return tuple((c / 255.0) ** 2.2 for c in (r, g, b))


PALETTE = {                         # identical to islandone_rock.py / islandone_stone.py, linear
    "base": srgb(126, 123, 119),
    "sun": srgb(168, 156, 138),
    "cool": srgb(100, 104, 112),
    "light": srgb(150, 147, 142),
    "fresh": srgb(146, 142, 135),   # D only: fresh fracture face, lighter, no weathering tint
}

# size: target real size (x, y, z) in metres, z = height above ground.
# Hull: radii are fractions of the half size, boxy = superellipsoid exponent, egg = one end
# fatter (+X), wedge = thinner towards +Y, sink = part of the hull below ground before the clip.
# cuts: explicit planes ((normal), (point as fraction of half size x, y and of height z)),
# planes/planes2/chips: random broad / medium / chip cuts (count, depth fraction), zmin: lowest
# allowed cut direction (z of the normal). lump/fine: erosion amplitude (build units).
# ridge (D): jagged chunk hull with a peak ridge instead of the superellipsoid; subdiv: keep crisp hull
# facets (no voxel remesh). fracture (D): fresh flat facets (normal, part of the extent that breaks off),
# cut after the erosion so their rims stay sharp; all of them are the lighter fracture face.
VARIANTS = {
    "B": dict(shape="round", sim_shape="round", seed=4117, size=(0.15, 0.13, 0.11),
              points=60, boxy=2.0, egg=0.10, wedge=0.0, sink=0.10, footprint=0.05,
              cuts=[], planes=5, depth=(0.015, 0.04), planes2=4, depth2=(0.01, 0.025), chips=0,
              depth_chip=(0, 0), zmin=-1.0, soften=4, lump=0.010, lump_scale=2.2, fine=0.004, dents=1,
              tris=(380, 130, 44), sharp=(60, 70, 80), flat_snap=0.012,
              role="hammer", sim_uses=["hammer", "throw", "fire_ring", "pickup"]),
    "C": dict(shape="flat", sim_shape="flat", seed=5233, size=(0.16, 0.11, 0.04),
              points=70, boxy=2.6, egg=0.0, wedge=0.28, sink=0.02, footprint=0.07,
              cuts=[((0.04, -0.05, 1.0), (0, 0, 0.93)), ((0, 0, -1.0), (0, 0, 0.02))],
              planes=0, depth=(0, 0), planes2=0, depth2=(0, 0),
              chips=0, depth_chip=(0, 0), rim=9, rim_depth=(0.04, 0.09), zmin=-0.6,
              soften=2, lump=0.008, lump_scale=2.6, fine=0.003, dents=1,
              tris=(340, 120, 40), sharp=(40, 48, 60), flat_snap=0.03,
              role="work_surface_or_blade", sim_uses=["work_surface", "blade", "scrape", "fire_ring", "pickup"]),
    "D": dict(shape="jagged", sim_shape="jagged", seed=6197, size=(0.13, 0.09, 0.07),
              points=40, boxy=2.6, egg=0.0, wedge=0.10, sink=0.08, footprint=0.08, ypad=1.15, ridge=(-0.1, -0.25),
              cuts=[((0.0, 0.25, -0.97), (0, 0.42, 0.05))], planes=10, depth=(0.10, 0.24), planes2=5, depth2=(0.03, 0.07), chips=4,
              depth_chip=(0.01, 0.03), zmin=-0.2, subdiv=3, soften=0, lump=0.004, lump_scale=2.4, fine=0.002, dents=0,
              fracture=[((0.6, 0.6, 0.5), 0.14), ((0.05, 0.6, 0.8), 0.10)],
              tris=(320, 110, 40), sharp=(35, 40, 50), flat_snap=0.03,
              role="cutter_or_blade", sim_uses=["cut", "blade", "scrape", "fire_ring", "pickup"]),
}

# tex: texture size, cage/ray: bake ray settings (build units), margin: UV island margin,
# max_dist: suggested LOD switch distance (m)
LODS = [
    dict(tex=256, cage=0.035, ray=0.12, margin=0.02, max_dist=8),
    dict(tex=128, cage=0.055, ray=0.18, margin=0.03, max_dist=18),
    dict(tex=64, cage=0.12, ray=0.40, margin=0.05, max_dist=35),
]
TRI_BUDGET = [(150, 400), (60, 150), (20, 50)]
CULL_DISTANCE = 50


# ---------------------------------------------------------------------------
# Base solid (same method as the rock family)
# ---------------------------------------------------------------------------
def rand_dir(rng):
    return Vector((rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1))).normalized()


def hull_bm(pts):
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    loose = {g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)}
    bmesh.ops.delete(bm, geom=list(loose), context='VERTS')
    return bm


def cut(pts, co, no):
    """Convex polytope (as points) intersected with the half-space (p - co) . no <= 0."""
    bm = hull_bm(pts)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                           plane_co=co, plane_no=no, clear_outer=True)
    out = [v.co.copy() for v in bm.verts]
    bm.free()
    return out


def plane_cuts(pts, rng, n, depth, zmin, horizontal=False):
    for _ in range(n):
        d = rand_dir(rng)
        if horizontal:
            d.z *= 0.45
            d.normalize()
        if d.z < zmin:
            continue
        dots = [p.dot(d) for p in pts]
        h = max(dots)
        nxt = cut(pts, d * (h - (h - min(dots)) * rng.uniform(*depth)), d)
        if len(nxt) >= 8:
            pts = nxt
    return pts


def half_size(v):
    sx, sy, sz = v["size"]
    return (sx * BUILD_SCALE / 2, sy * BUILD_SCALE / 2 * v.get("ypad", 1.0), sz * BUILD_SCALE)


def base_solid(v, rng):
    rx, ry, H = half_size(v)
    e = v["boxy"]
    rz = (H + v["sink"] * H) / 2              # ellipsoid half height before the ground clip
    zc = rz - v["sink"] * H
    phase = rng.uniform(0, 2 * math.pi)
    pts = []
    if v.get("ridge"):
        # jagged chunk: irregular footprint, a shoulder ring leaning back and a short peak ridge
        for i in range(9):
            a = 2 * math.pi * i / 9 + rng.uniform(-0.25, 0.25)
            k = rng.uniform(0.85, 1.05)
            pts.append(Vector((math.cos(a) * rx * k, math.sin(a) * ry * k, -0.08 * H)))
        for i in range(7):
            a = 2 * math.pi * i / 7 + rng.uniform(-0.3, 0.3)
            k = rng.uniform(0.55, 0.8)
            pts.append(Vector((math.cos(a) * rx * k, math.sin(a) * ry * k * 0.8 - 0.15 * ry, H * rng.uniform(0.45, 0.65))))
        px, py = v["ridge"]
        pts += [Vector(((px - 0.2) * rx, py * ry, H * 0.9)), Vector(((px + 0.12) * rx, (py + 0.06) * ry, H))]
    while len(pts) < v["points"]:
        d = rand_dir(rng)
        q = [math.copysign(abs(c) ** (2.0 / e), c) for c in d]
        az = math.atan2(d.y, d.x)
        k = 1.0 + v["footprint"] * math.sin(2 * az + phase) + 0.5 * v["footprint"] * math.sin(3 * az + 2 * phase)
        x, y, z = q[0] * rx * k, q[1] * ry * k, q[2] * rz
        fat = 1.0 + v["egg"] * q[0]                       # egg: fatter towards +X
        thin = 1.0 - v["wedge"] * q[1]                    # wedge: thinner towards +Y
        y *= fat
        z = (z + rz) * fat * thin - rz                    # keep the underside, shrink from the top
        pts.append(Vector((x, y, z + zc)))
    for n, (px, py, pz) in v["cuts"]:
        pts = cut(pts, Vector((px * rx, py * ry, pz * H)), Vector(n).normalized())
    pts = cut(pts, Vector((0, 0, -EMBED_B - 0.06)), Vector((0, 0, -1)))
    pts = plane_cuts(pts, rng, v["planes"], v["depth"], v["zmin"])
    pts = plane_cuts(pts, rng, v["planes2"], v["depth2"], v["zmin"])
    pts = plane_cuts(pts, rng, v.get("rim", 0), v.get("rim_depth", (0, 0)), v["zmin"], horizontal=True)
    pts = plane_cuts(pts, rng, v["chips"], v["depth_chip"], v["zmin"])
    bm = hull_bm(pts)
    me = bpy.data.meshes.new("_base")
    bm.to_mesh(me)
    bm.free()
    return me


def subdivided(me, levels):
    """Jagged stone: keep the crisp hull facets, only add vertices for the erosion and the bake."""
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    for _ in range(levels):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    me.update()
    return me


def remeshed(me, voxel, soften):
    tmp = bpy.data.objects.new("_remesh", me)
    bpy.context.scene.collection.objects.link(tmp)
    mod = tmp.modifiers.new("remesh", 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    mod.adaptivity = 0.0
    if soften:
        sm = tmp.modifiers.new("soften", 'SMOOTH')
        sm.factor, sm.iterations = 0.5, soften
    dg = bpy.context.evaluated_depsgraph_get()
    out = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp, do_unlink=True)
    bpy.data.meshes.remove(me)
    return out


def sculpt(me, v, rng):
    """Gentle erosion and a shallow dent along a smooth radial field (nothing folds)."""
    verts = me.vertices
    zmax = max(vv.co.z for vv in verts)
    zc = 0.45 * zmax
    off = Vector((rng.uniform(0, 100), rng.uniform(0, 100), rng.uniform(0, 100)))

    def radial(p):
        r = p - Vector((0, 0, zc))
        r.z *= 0.7
        return r.normalized() if r.length > 1e-6 else Vector((0, 0, 1))

    pts = [vv.co.copy() for vv in verts]
    for i, p in enumerate(pts):
        n = noise.noise((p + off) * v["lump_scale"]) * v["lump"] + noise.noise((p + off) * 6.0) * v["fine"]
        g = min(1.0, max(0.0, (p.z + EMBED_B) / 0.05))
        pts[i] = p + radial(p) * n * g
    surf = [p for p in pts if p.z > 0.5 * zmax]
    for _ in range(v["dents"]):
        c, r, depth = rng.choice(surf), 0.12 * max(half_size(v)[:2]) / 0.45, 0.010
        for i, p in enumerate(pts):
            d2 = (p - c).length_squared / (r * r)
            if d2 < 4.0:
                pts[i] = p - radial(p) * depth * math.exp(-d2 * 1.5)
    for vv, p in zip(verts, pts):
        vv.co = p
    me.update()
    return me


def bisect_fill(bm, co, no, tag_layer=None):
    """Cut away the side in front of the plane and close the hole with one flat face."""
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                                 plane_co=co, plane_no=no, clear_outer=True)
    edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_boundary]
    new_faces = []
    if edges:
        new_faces = bmesh.ops.holes_fill(bm, edges=edges, sides=0)["faces"]
    if tag_layer is not None:
        for f in new_faces:
            f[tag_layer] = 1.0
    return new_faces


def fracture_and_clip(me, v):
    bm = bmesh.new()
    bm.from_mesh(me)
    frac = bm.faces.layers.float.new("frac")
    for f in bm.faces:
        f[frac] = 0.0
    if v.get("fracture"):
        for n, depth in v["fracture"]:                # normal, part of the extent along it that breaks off
            n = Vector(n).normalized()
            dots = [vv.co.dot(n) for vv in bm.verts]
            h = max(dots)
            bisect_fill(bm, n * (h - (h - min(dots)) * depth), n, frac)
    bisect_fill(bm, Vector((0, 0, -EMBED_B)), Vector((0, 0, -1)))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    me.update()
    return me


def fit_size(me, v):
    """Centre the footprint on the origin and scale to the target size (x, y, height)."""
    xs = [vv.co.x for vv in me.vertices]
    ys = [vv.co.y for vv in me.vertices]
    zs = [vv.co.z for vv in me.vertices]
    sx, sy, sz = (s * BUILD_SCALE for s in v["size"])
    me.transform(Matrix.Translation(-Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, 0))))
    S = Matrix.Diagonal((sx / (max(xs) - min(xs)), sy / (max(ys) - min(ys)), sz / max(zs), 1.0))
    # keep the ground clip at -EMBED_B: scale about z = 0, then re-place the underside
    me.transform(S)
    for vv in me.vertices:
        if vv.co.z < 0:
            vv.co.z = max(vv.co.z, -EMBED_B)
    me.update()


# ---------------------------------------------------------------------------
# LODs, UVs, collision
# ---------------------------------------------------------------------------
def tri_count(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def decimated(me, target, name):
    tmp = bpy.data.objects.new("_dec", me)
    bpy.context.scene.collection.objects.link(tmp)
    mod = tmp.modifiers.new("dec", 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.use_collapse_triangulate = True
    ratio = min(1.0, target / max(tri_count(me), 1))
    out = None
    for _ in range(6):
        mod.ratio = ratio
        dg = bpy.context.evaluated_depsgraph_get()
        cand = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
        n = tri_count(cand)
        if out:
            bpy.data.meshes.remove(out)
        out = cand
        if abs(n - target) <= max(2, target * 0.04):
            break
        ratio *= target / max(n, 1)
    out.name = name
    bpy.data.objects.remove(tmp, do_unlink=True)
    return out


def flatten_bottom(me, snap):
    """Decimation can lift single underside vertices; snap those near the ground cut back."""
    for vv in me.vertices:
        if vv.co.z < -EMBED_B + snap:
            vv.co.z = -EMBED_B
    me.update()


def finish_shading(me, angle):
    me.materials.clear()
    for p in me.polygons:
        p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(angle))
    me.validate()
    me.update()


def smart_uv(obj, margin):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')


def uv_stats(me):
    uv = me.uv_layers.active.data
    ratios, uv_total = [], 0.0
    for p in me.polygons:
        a = [uv[li].uv for li in p.loop_indices]
        ua = abs((a[1] - a[0]).cross(a[2] - a[0])) / 2 if len(a) == 3 else 0.0
        uv_total += ua
        if p.area > 1e-12:
            ratios.append(ua / p.area)
    ratios.sort()
    med = ratios[len(ratios) // 2] or 1.0
    return dict(uv_coverage=round(uv_total, 3),
                texel_ratio_p10=round(ratios[len(ratios) // 10] / med, 2),
                texel_ratio_p90=round(ratios[len(ratios) * 9 // 10] / med, 2))


def convex_collider(me, name):
    """Convex hull of a few far-apart surface points (farthest point sampling), at most
    COLLIDER_MAX_TRIS triangles. Bottom points are kept so the hull stands on the ground."""
    pts = [vv.co.copy() for vv in me.vertices]
    for k in range(10, 4, -1):
        chosen = [max(pts, key=lambda p: p.x), min(pts, key=lambda p: p.x)]
        dist = [min((p - c).length for c in chosen) for p in pts]
        while len(chosen) < k:
            i = max(range(len(pts)), key=lambda j: dist[j])
            chosen.append(pts[i])
            dist = [min(d, (p - pts[i]).length) for d, p in zip(dist, pts)]
        bm = hull_bm(chosen)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        if len(bm.faces) <= COLLIDER_MAX_TRIS:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            out = bpy.data.meshes.new(name)
            bm.to_mesh(out)
            bm.free()
            return out
        bm.free()
    raise RuntimeError("collider")


# ---------------------------------------------------------------------------
# Materials and baking (shader identical to the rock family; D adds the fracture face)
# ---------------------------------------------------------------------------
def procedural_material(bump_strength=0.45, cell_scale=11.0, fracture=False):
    mat = bpy.data.materials.new("_rock_procedural")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    L = nt.links.new
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nz = nt.nodes.new("ShaderNodeSeparateXYZ")
    L(geo.outputs["Normal"], nz.inputs[0])
    obj = tc.outputs["Object"]

    def sock(x, target):
        if isinstance(x, (int, float)):
            target.default_value = x
        else:
            L(x, target)

    def rgb(col):
        n = nt.nodes.new("ShaderNodeRGB")
        n.outputs[0].default_value = (*col, 1.0)
        return n.outputs[0]

    def mix(fac, a, b, blend='MIX'):
        m = nt.nodes.new("ShaderNodeMix")
        m.data_type = 'RGBA'
        m.blend_type = blend
        sock(fac, m.inputs["Factor"])
        L(a, m.inputs[6])
        L(b, m.inputs[7])
        return m.outputs[2]

    def mixf(fac, a, b):
        m = nt.nodes.new("ShaderNodeMix")
        m.data_type = 'FLOAT'
        sock(fac, m.inputs["Factor"])
        sock(a, m.inputs[2])
        sock(b, m.inputs[3])
        return m.outputs[0]

    def ramp(src, a, b):
        r = nt.nodes.new("ShaderNodeMapRange")
        r.inputs["From Min"].default_value = a
        r.inputs["From Max"].default_value = b
        L(src, r.inputs["Value"])
        return r.outputs[0]

    def op(name, a, b):
        m = nt.nodes.new("ShaderNodeMath")
        m.operation = name
        sock(a, m.inputs[0])
        sock(b, m.inputs[1])
        return m.outputs[0]

    def tex_noise(scale, detail=3.0, rough=0.55):
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = rough
        L(obj, n.inputs["Vector"])
        return n.outputs["Fac"]

    c = mix(ramp(tex_noise(0.8), 0.45, 0.65), rgb(PALETTE["base"]), rgb(PALETTE["light"]))
    up = ramp(nz.outputs["Z"], 0.25, 0.85)
    c = mix(op('MULTIPLY', up, ramp(tex_noise(2.2, 4.0), 0.35, 0.6)), c, rgb(PALETTE["sun"]))
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.12
    ao.samples = 16
    cav = op('MAXIMUM', ramp(ao.outputs["AO"], 0.9, 0.45), ramp(nz.outputs["Z"], -0.1, -0.7))
    c = mix(op('MULTIPLY', cav, 0.8), c, rgb(PALETTE["cool"]))
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = 'DISTANCE_TO_EDGE'
    vor.inputs["Scale"].default_value = cell_scale
    L(obj, vor.inputs["Vector"])
    edge = ramp(vor.outputs["Distance"], 0.0, 0.08)
    shade = op('ADD', op('MULTIPLY', edge, 0.08), op('ADD', op('MULTIPLY', tex_noise(30.0, 2.0), 0.14), 0.86))
    rough = op('ADD', 0.9, op('MULTIPLY', op('SUBTRACT', tex_noise(4.0), 0.5), 0.12))
    rough = op('SUBTRACT', rough, op('MULTIPLY', up, 0.08))
    pit = ramp(tex_noise(14.0, 2.0), 0.62, 0.75)
    h = op('ADD', vor.outputs["Distance"], op('ADD', op('MULTIPLY', pit, -0.15),
                                               op('MULTIPLY', tex_noise(45.0, 2.0), 0.05)))
    if fracture:
        # fresh fracture: lighter, no sun tint and no cavity colour, fine grain and faint
        # conchoidal ripples around the point of impact instead of the weathered cells
        fr = nt.nodes.new("ShaderNodeAttribute")
        fr.attribute_type = 'GEOMETRY'
        fr.attribute_name = "frac"
        f = fr.outputs["Fac"]
        fresh = mix(ramp(tex_noise(3.0, 3.0), 0.35, 0.7), rgb(PALETTE["fresh"]), rgb(PALETTE["light"]))
        fresh = mix(0.3, fresh, c)
        c = mix(f, c, fresh)
        dist = nt.nodes.new("ShaderNodeVectorMath")
        dist.operation = 'DISTANCE'
        L(obj, dist.inputs[0])
        dist.inputs[1].default_value = (0.25, 0.55, 0.05)
        ripple = op('MULTIPLY', op('SINE', op('MULTIPLY', dist.outputs["Value"], 30.0), 0), 0.12)
        ripple_c = op('MULTIPLY', ripple, 0.5)
        shade = mixf(f, shade, op('ADD', op('MULTIPLY', tex_noise(40.0, 2.0), 0.10), op('ADD', 0.90, ripple_c)))
        rough = mixf(f, rough, 0.78)
        hf = op('ADD', ripple, op('ADD', op('MULTIPLY', tex_noise(60.0, 2.0), 0.06), op('MULTIPLY', tex_noise(12.0, 3.0), 0.08)))
        h = mixf(f, h, hf)
    sh = nt.nodes.new("ShaderNodeMix")
    sh.data_type = 'RGBA'
    sh.blend_type = 'MULTIPLY'
    sh.inputs["Factor"].default_value = 1.0
    L(c, sh.inputs[6])
    L(shade, sh.inputs[7])
    L(sh.outputs[2], bsdf.inputs["Base Color"])
    L(rough, bsdf.inputs["Roughness"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.02
    L(h, bump.inputs["Height"])
    L(bump.outputs["Normal"], bsdf.inputs["Normal"])
    L(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def export_material(name, base_img, rough_img, nrm_img):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Metallic"].default_value = 0.0
    tb = nt.nodes.new("ShaderNodeTexImage")
    tb.image = base_img
    tr = nt.nodes.new("ShaderNodeTexImage")
    tr.image = rough_img
    rough_img.colorspace_settings.name = 'Non-Color'
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = nrm_img
    nrm_img.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tr.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])   # glTF metallicRoughness: G = roughness
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.use_backface_culling = True
    return mat


def bake(target, source, img, kind, lod):
    scene = bpy.context.scene
    target.data.materials[0].node_tree.nodes.active.image = img
    hidden = [o for o in scene.objects if o not in (target, source) and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    bpy.ops.object.select_all(action='DESELECT')
    source.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    kw = dict(type=kind, use_selected_to_active=True, cage_extrusion=lod["cage"],
              max_ray_distance=lod["ray"], margin=4, use_clear=True)
    if kind == 'DIFFUSE':
        kw["pass_filter"] = {'COLOR'}
    if kind == 'NORMAL':
        kw["normal_space"] = 'TANGENT'
    bpy.ops.object.bake(**kw)
    for o in hidden:
        o.hide_render = False


# ---------------------------------------------------------------------------
# Sockets
# ---------------------------------------------------------------------------
def socket_rotation(normal, along=(1, 0, 0)):
    z = Vector(normal).normalized()
    xr = Vector(along).normalized()
    xr = (xr - z * xr.dot(z))
    if xr.length < 1e-4:
        xr = Vector((0, 0, 1)) if abs(z.z) < 0.9 else Vector((1, 0, 0))
    x = xr.normalized()
    y = z.cross(x).normalized()
    return Matrix((x, y, z)).transposed().to_quaternion()


def bvh_of(me):
    return BVHTree.FromPolygons([vv.co.copy() for vv in me.vertices], [tuple(p.vertices) for p in me.polygons])


def cast(bvh, origin, direction):
    loc, nrm, _, _ = bvh.ray_cast(Vector(origin), Vector(direction).normalized())
    return loc, nrm


def edge_line(me):
    """C and D: the cutting edge is the front (+Y) rim. For slices along X take the
    frontmost vertex; the edge socket is the middle one, the edge runs through the slices."""
    vs = [vv.co.copy() for vv in me.vertices]
    xs = [p.x for p in vs]
    x0, x1 = min(xs), max(xs)
    pts = []
    for t in np.linspace(0.2, 0.8, 7):
        x = x0 + (x1 - x0) * t
        band = [p for p in vs if abs(p.x - x) < (x1 - x0) * 0.07]
        if band:
            pts.append(max(band, key=lambda p: p.y))
    mid = pts[len(pts) // 2]
    along = (pts[-1] - pts[0]).normalized()
    return pts[0], mid, pts[-1], along


def make_sockets(key, v, me):
    """Positions in Blender Z-up metres (real size). Returns {name: (pos, normal, along)}."""
    bvh = bvh_of(me)
    xs = [vv.co.x for vv in me.vertices]
    ys = [vv.co.y for vv in me.vertices]
    zs = [vv.co.z for vv in me.vertices]
    h = max(zs)
    s = {}
    if v["shape"] == "round":
        s["GRIP"] = (Vector((0, 0, h * 0.5)), Vector((0, 0, 1)), Vector((1, 0, 0)))
        top, n = cast(bvh, (0, 0, h + 0.2), (0, 0, -1))
        s["BIND"] = (top, n, Vector((0, 1, 0)))                       # stick across the waist, along +Y
    else:
        back, n = cast(bvh, (0, min(ys) - 0.2, h * 0.5), (0, 1, 0))
        s["BIND"] = (back, n, Vector((1, 0, 0)))                      # stick along the back, parallel to the edge
        s["GRIP"] = (Vector((0, back.y * 0.5, h * 0.5)), Vector((0, 0, 1)), Vector((1, 0, 0)))
        e0, em, e1, along = edge_line(me)
        out = Vector((0, 1, 0))
        out = (out - along * out.dot(along)).normalized()
        # edge bisector: outward between the faces above and below the edge
        up_hit, up_n = cast(bvh, em + Vector((0, -0.012, 0.05)), (0, 0, -1))
        dn_hit, dn_n = cast(bvh, em + Vector((0, -0.012, -0.05)), (0, 0, 1))
        if up_n and dn_n:
            bis = (up_n + dn_n)
            if bis.length > 1e-3:
                out = (bis - along * bis.dot(along)).normalized()
        s["EDGE"] = (em, out, along)
        s["_edge_ends"] = (e0, e1)
        if up_n and dn_n:
            s["_edge_angle_deg"] = round(180 - math.degrees(up_n.angle(dn_n)), 1)
    return s


# ---------------------------------------------------------------------------
# Scene
# ---------------------------------------------------------------------------
def collection(name, parent=None):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    parent = parent or bpy.context.scene.collection
    if col.name not in parent.children:
        parent.children.link(col)
    return col


def r4(vec):
    return [round(c, 4) for c in vec]


def to_gltf(vec):
    return [round(vec[0], 4), round(vec[2], 4), round(-vec[1], 4)]


def build_variant(key, v, c_family, tex_dir):
    asset = f"{FAMILY}_{key}"
    c_var = collection(asset, c_family)
    subs = {s: collection(f"{asset}_{s}", c_var) for s in ("LOD0", "LOD1", "LOD2", "Collision", "Sockets")}
    rng = random.Random(v["seed"])
    dense = base_solid(v, rng)
    dense = subdivided(dense, v["subdiv"]) if v.get("subdiv") else remeshed(dense, VOXEL, v["soften"])
    dense = sculpt(dense, v, rng)
    dense = fracture_and_clip(dense, v)
    fit_size(dense, v)
    dense.name = f"_{asset}_dense"
    src = bpy.data.objects.new(dense.name, dense)
    bpy.context.scene.collection.objects.link(src)
    proc_mat = procedural_material(fracture=bool(v.get("fracture")))
    dense.materials.append(proc_mat)
    for p in dense.polygons:
        p.use_smooth = True
    dense.set_sharp_from_angle(angle=math.radians(v["sharp"][0]))

    meshes, prev = [], dense
    for li, target in enumerate(v["tris"]):
        me = decimated(prev, target, f"{asset}_LOD{li}")
        flatten_bottom(me, v["flat_snap"])
        finish_shading(me, v["sharp"][li])
        meshes.append(me)
        prev = me

    root = bpy.data.objects.new(asset, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.1
    c_var.objects.link(root)
    lods = []
    for li, (me, lod) in enumerate(zip(meshes, LODS)):
        o = bpy.data.objects.new(me.name, me)
        subs[f"LOD{li}"].objects.link(o)
        smart_uv(o, lod["margin"])
        size = lod["tex"]
        imgs = {}
        for kind, label in (('DIFFUSE', "BaseColor"), ('ROUGHNESS', "Roughness"), ('NORMAL', "Normal")):
            img = bpy.data.images.new(f"{asset}_LOD{li}_{label}", size, size, alpha=False)
            if kind != 'DIFFUSE':
                img.colorspace_settings.name = 'Non-Color'
            imgs[kind] = img
        tmat = bpy.data.materials.new("_bake_target")
        tmat.use_nodes = True
        tn = tmat.node_tree.nodes.new("ShaderNodeTexImage")
        tmat.node_tree.nodes.active = tn
        me.materials.append(tmat)
        for kind, img in imgs.items():
            bake(o, src, img, kind, lod)
            img.filepath_raw = os.path.join(tex_dir, img.name + ".png")
            img.file_format = 'PNG'
            img.save()
        me.materials.clear()
        bpy.data.materials.remove(tmat)
        me.materials.append(export_material(f"{MATERIAL_NAME}_{key}{li}",
                                            imgs['DIFFUSE'], imgs['ROUGHNESS'], imgs['NORMAL']))
        o.parent = root
        o["lod"] = li
        o["max_distance_m"] = lod["max_dist"]
        lods.append(dict(node=me.name, lod=li, triangles=tri_count(me), texture_px=size, **uv_stats(me)))

    shrink = Matrix.Scale(1.0 / BUILD_SCALE, 4)
    for me in meshes:
        me.transform(shrink)
        me.update()
    for l, me in zip(lods, meshes):     # texel density in px per metre at real size
        uvl = me.uv_layers.active.data
        uv_a = sum(abs((uvl[p.loop_indices[1]].uv - uvl[p.loop_indices[0]].uv).cross(
            uvl[p.loop_indices[2]].uv - uvl[p.loop_indices[0]].uv)) / 2 for p in me.polygons)
        l["texel_px_per_m"] = round(l["texture_px"] * math.sqrt(uv_a / sum(p.area for p in me.polygons)))

    col_me = convex_collider(meshes[1], f"{asset}_COL")
    col = bpy.data.objects.new(f"{asset}_COL", col_me)
    subs["Collision"].objects.link(col)
    col.parent = root
    col.display_type = 'WIRE'
    col.hide_render = True
    col["collider"] = "convex"

    socks = make_sockets(key, v, meshes[0])
    sock_meta = {}
    for name in ("GRIP", "BIND", "EDGE"):
        if name not in socks:
            continue
        pos, nrm, along = socks[name]
        e = bpy.data.objects.new(f"SOCKET_{name}.{key}", None)        # plain SOCKET_<NAME> in the GLB
        e.empty_display_type = 'ARROWS'
        e.empty_display_size = 0.03
        e.location = pos
        e.rotation_mode = 'QUATERNION'
        e.rotation_quaternion = socket_rotation(nrm, along)
        e.parent = root
        e["socket"] = name
        subs["Sockets"].objects.link(e)
        sock_meta[name] = dict(node=f"SOCKET_{name}", pos_blender_zup=r4(pos), pos_gltf_yup=to_gltf(pos),
                               normal_blender_zup=r4(Vector(nrm).normalized()),
                               along_blender_zup=r4(Vector(along).normalized()))
    edge = None
    if "_edge_ends" in socks:
        e0, e1 = socks["_edge_ends"]
        edge = dict(start_blender_zup=r4(e0), end_blender_zup=r4(e1), start_gltf_yup=to_gltf(e0),
                    end_gltf_yup=to_gltf(e1), length_m=round((e1 - e0).length, 3),
                    edge_angle_deg=socks.get("_edge_angle_deg"))

    ws = [vv.co for vv in meshes[0].vertices]
    dims = [round(max(p.x for p in ws) - min(p.x for p in ws), 3), round(max(p.y for p in ws) - min(p.y for p in ws), 3),
            round(max(p.z for p in ws), 3)]
    frac_area = 0.0
    if v.get("fracture"):
        fa = dense.attributes.get("frac")
        frac_area = sum(p.area for p, a in zip(dense.polygons, fa.data) if a.value > 0.5) / BUILD_SCALE ** 2
    states = {
        "lying": "default: root on the ground, random yaw; any of the three LODs",
        "held": "attach SOCKET_GRIP to the hand bone",
        "tied": ("hammer head: the stick runs along SOCKET_BIND local +X, lying on the stone at SOCKET_BIND "
                 "(offset by the stick radius along local +Z), lashed around the waist")
        if v["shape"] == "round" else
        ("blade: the stick runs along SOCKET_BIND local +X (parallel to the edge), against the back of the "
         "stone at SOCKET_BIND (offset by the stick radius along local +Z); SOCKET_EDGE faces away from the stick"),
        "wet": WET,
    }
    root["asset_id"] = asset
    root["kit"] = KIT_ID
    root["family"] = "IslandOne rock family (IO_Rock_Large_A/B, IO_Stone_Small_A)"
    root["category"] = "pickup_item"
    root["sim_kind"] = "stones"
    root["shape"] = v["sim_shape"]
    root["tool_role"] = v["role"]
    root["sim_uses"] = json.dumps(v["sim_uses"])
    root["usage"] = "loose stone at the shoreline and the rocks: pick-up item, tool material, fire ring material"
    root["pickup"] = True
    root["pivot"] = "footprint centre at ground level (Z = 0, glTF y = 0)"
    root["lod_levels"] = len(LODS)
    root["lod_nodes"] = json.dumps([f"{asset}_LOD{i}" for i in range(len(LODS))])
    root["lod_max_distance_m"] = json.dumps([l["max_dist"] for l in LODS])
    root["cull_distance_m"] = CULL_DISTANCE
    root["dimensions_m"] = json.dumps(dims)
    root["embed_depth_m"] = EMBED
    root["material_id"] = MATERIAL_NAME
    root["collision_node"] = f"{asset}_COL"
    root["collision_type"] = "convex"
    root["walkable"] = False
    root["wetness"] = json.dumps(WET)
    root["states"] = json.dumps(states)
    root["sockets"] = json.dumps(sock_meta)
    if edge:
        root["edge"] = json.dumps(edge)
    root["copyright"] = COPYRIGHT

    bpy.data.objects.remove(src, do_unlink=True)
    bpy.data.meshes.remove(dense)
    bpy.data.materials.remove(proc_mat)
    info = dict(asset=asset, file=f"{asset}.glb", shape=v["sim_shape"], tool_role=v["role"], sim_uses=v["sim_uses"],
                target_size_m=list(v["size"]), dimensions_m=dims, embed_depth_m=EMBED, lods=lods,
                collision=dict(node=f"{asset}_COL", type="convex", triangles=tri_count(col_me)),
                sockets=sock_meta, states=states)
    if edge:
        info["edge"] = edge
    if frac_area:
        info["fracture_face_area_m2"] = round(frac_area, 5)
    return root, info


def export_glb(root, path):
    socks = [o for o in root.children if o.get("socket")]
    for o in socks:
        o.name = "SOCKET_" + o["socket"]
    bpy.ops.object.select_all(action='DESELECT')
    for o in [root] + list(root.children):
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    loc = root.location.copy()
    root.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
                              export_extras=True, export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_tangents=False,
                              export_image_format='JPEG', export_image_quality=90,
                              export_copyright=COPYRIGHT)
    root.location = loc
    for o in socks:
        o.name = f"SOCKET_{o['socket']}.{root['asset_id'][-1]}"
    patch_glb(path)


def read_glb_json(path):
    with open(path, "rb") as f:
        data = f.read()
    jlen = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + jlen]), data


def patch_glb(path):
    """One material name for all LODs (IO_MAT_Rock_Gray) and the authorship notice."""
    js, data = read_glb_json(path)
    magic, ver, _ = struct.unpack_from("<III", data, 0)
    jlen, jtype = struct.unpack_from("<II", data, 12)
    for m in js.get("materials", []):
        m["name"] = MATERIAL_NAME
    js.setdefault("asset", {})["copyright"] = COPYRIGHT
    js["asset"]["extras"] = dict(CREDITS)
    new = json.dumps(js, separators=(",", ":")).encode()
    new += b" " * ((4 - len(new) % 4) % 4)
    rest = data[20 + jlen:]
    with open(path, "wb") as f:
        f.write(struct.pack("<III", magic, ver, 20 + len(new) + len(rest)))
        f.write(struct.pack("<II", len(new), jtype))
        f.write(new)
        f.write(rest)


# ---------------------------------------------------------------------------
# Renders
# ---------------------------------------------------------------------------
def setup_studio(scene, samples):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Base Contrast'
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.72, 0.74, 0.78, 1)
    bg.inputs[1].default_value = 1.0
    scene.world = world
    sun_data = bpy.data.lights.new("Sun", 'SUN')
    sun_data.energy = 4.0
    sun_data.angle = math.radians(8)
    sun_data.color = (1.0, 0.94, 0.85)
    sun = bpy.data.objects.new("Sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = Vector((-0.55, -0.6, -0.75)).to_track_quat('-Z', 'Y').to_euler()
    gme = bpy.data.meshes.new("Ground")
    gme.from_pydata([(-100, -100, 0), (100, -100, 0), (100, 100, 0), (-100, 100, 0)], [], [(0, 1, 2, 3)])
    gm = bpy.data.materials.new("M_ground")
    gm.use_nodes = True
    p = gm.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.74, 0.75, 0.78, 1)
    p.inputs["Roughness"].default_value = 0.9
    gme.materials.append(gm)
    g = bpy.data.objects.new("Ground", gme)
    scene.collection.objects.link(g)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return [sun, g, cam], [world], [gm]


def cleanup(objs, worlds, mats):
    for o in objs:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)
        elif isinstance(data, bpy.types.Camera):
            bpy.data.cameras.remove(data)
        elif isinstance(data, bpy.types.Light):
            bpy.data.lights.remove(data)
    for w in worlds:
        bpy.data.worlds.remove(w)
    for m in mats:
        bpy.data.materials.remove(m)
    bpy.context.scene.world = None


def render_view(scene, path, loc, target, lens=50, res=(1600, 1200)):
    cam = scene.camera
    cam.data.lens = lens
    cam.data.clip_start = 0.005
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def orbit(deg, elev_deg, dist, target):
    """deg 0 = camera in front (+Y, the edge side of C and D), 90 = camera at +X."""
    a, e = math.radians(deg), math.radians(elev_deg)
    return (target[0] + dist * math.cos(e) * math.sin(a), target[1] + dist * math.cos(e) * math.cos(a),
            target[2] + dist * math.sin(e))


def show_only(roots, visible, lod=0, extra=()):
    vis = set(visible) if visible is not None else set(roots)
    for r in roots:
        for ch in r.children:
            if ch.type == 'MESH':
                ch.hide_render = r not in vis or ch.get("lod") != lod
    for o in extra:
        o.hide_render = False


def load_np(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return px.reshape(h, w, 4)[::-1].copy()


def save_np(arr, path):
    h, w = arr.shape[:2]
    out = bpy.data.images.new("_out", w, h, alpha=False)
    out.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).astype(np.float32).ravel())
    out.filepath_raw = path
    out.file_format = 'PNG'
    out.save()
    bpy.data.images.remove(out)


def resize(arr, h, w):
    H, W = arr.shape[:2]
    ys = np.clip((np.arange(h) + 0.5) * H / h - 0.5, 0, H - 1)
    xs = np.clip((np.arange(w) + 0.5) * W / w - 0.5, 0, W - 1)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, H - 1), np.minimum(x0 + 1, W - 1)
    fy, fx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    a = arr[y0][:, x0] * (1 - fx) + arr[y0][:, x1] * fx
    b = arr[y1][:, x0] * (1 - fx) + arr[y1][:, x1] * fx
    return a * (1 - fy) + b * fy


def contact_sheet(tiles, cols, path, remove=True):
    arrs = [load_np(t) for t in tiles]
    h, w = arrs[0].shape[:2]
    rows = math.ceil(len(arrs) / cols)
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for i, a in enumerate(arrs):
        r, c = divmod(i, cols)
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = a
    save_np(sheet, path)
    if remove:
        for t in tiles:
            os.remove(t)


# columns of the 1448 x 1086 reference sheet (upper row: three-quarter view, lower row: low side view)
REF_COLS = {"B": (100, 515), "C": (540, 995), "D": (1015, 1415)}
REF_ROWS = ((265, 585), (650, 900))
REF_CAMS = {"B": ((-25, 16), (-5, 6)), "C": ((-20, 18), (-10, 5)), "D": ((-60, 16), (-40, 6))}


def render_all(scene, roots, infos, out_dir, samples, ref_path):
    objs, worlds, mats = setup_studio(scene, samples)
    qa = os.path.join(out_dir, "qa")
    os.makedirs(qa, exist_ok=True)
    keys = list(VARIANTS)
    offs = {"B": (-0.20, 0.0), "C": (0.0, 0.02), "D": (0.20, 0.0)}
    for key, root in zip(keys, roots):
        root.location = (*offs[key], 0)
    show_only(roots, None, 0)
    tgt = (0.0, 0.0, 0.03)
    render_view(scene, os.path.join(out_dir, "render_hero_BCD.png"), orbit(-18, 26, 0.95, tgt), tgt, 50, (1920, 1080))
    render_view(scene, os.path.join(out_dir, "render_compare_BCD_gameplay.png"), orbit(25, 40, 1.15, tgt), tgt, 50,
                (1600, 1200))
    for root in roots:
        root.location = (0, 0, 0)
    for key, root in zip(keys, roots):
        show_only(roots, [root], 0)
        L = max(infos[key]["dimensions_m"][:2])
        hgt = infos[key]["dimensions_m"][2]
        dist = 2.0 * L + 0.06
        t = (0, 0, hgt * 0.4)
        name = f"{FAMILY}_{key}"
        views = [
            ("1_three_quarter_front", orbit(-35, 24, dist, t), (1600, 1200)),
            ("2_three_quarter_back", orbit(145, 24, dist, t), (1600, 1200)),
            ("3_side", orbit(90, 3, dist, t), (1800, 900)),
            ("4_gameplay_40deg", orbit(25, 40, dist * 1.1, t), (1600, 1200)),
        ]
        for vname, loc, res in views:
            render_view(scene, os.path.join(qa, f"{name}_{vname}.png"), loc, t, 50, res)
        tiles = []
        for k, deg in enumerate(list(range(0, 360, 45)) + ["above"]):
            loc = orbit(0, 89.5, dist * 1.1, t) if deg == "above" else orbit(deg, 40, dist * 1.1, t)
            tp = os.path.join(qa, f"_tile_{k}.png")
            render_view(scene, tp, loc, t, 50, (720, 540))
            tiles.append(tp)
        contact_sheet(tiles, 3, os.path.join(qa, f"{name}_5_360.png"))
        tiles = []
        for li in range(3):
            show_only(roots, [root], li)
            tp = os.path.join(qa, f"_lod_{li}.png")
            render_view(scene, tp, orbit(-35, 30, dist, t), t, 50, (800, 600))
            tiles.append(tp)
        for li, dm in enumerate((4.0, 10.0, 22.0)):        # gameplay distance of each LOD, 40 degrees
            show_only(roots, [root], li)
            tp = os.path.join(qa, f"_lodg_{li}.png")
            render_view(scene, tp, orbit(25, 40, dm, t), t, 50 * dm / (dist * 1.6), (800, 600))
            tiles.append(tp)
        contact_sheet(tiles, 3, os.path.join(qa, f"{name}_6_lods.png"))
        show_only(roots, [root], 0)
        if ref_path and os.path.exists(ref_path):
            ref = load_np(ref_path)
            x0, x1 = REF_COLS[key]
            col = []
            for (y0, y1), (deg, el) in zip(REF_ROWS, REF_CAMS[key]):
                crop = ref[y0:y1, x0:x1]
                hh = 600
                crop = resize(crop, hh, int(crop.shape[1] * hh / crop.shape[0]))
                tp = os.path.join(qa, "_ref_render.png")
                render_view(scene, tp, orbit(deg, el, dist * 0.95, t), t, 50, (int(hh * 1.33), hh))
                rnd = load_np(tp)
                os.remove(tp)
                gap = np.ones((hh, 24, 4), dtype=np.float32)
                col.append(np.concatenate([crop, gap, rnd], 1))
            w = max(c.shape[1] for c in col)
            col = [np.concatenate([c, np.ones((c.shape[0], w - c.shape[1], 4), np.float32)], 1) for c in col]
            sep = np.ones((24, w, 4), dtype=np.float32)
            save_np(np.concatenate([col[0], sep, col[1]], 0), os.path.join(qa, f"{name}_7_vs_reference.png"))
    render_sockets(scene, roots, infos, qa)
    cleanup(objs, worlds, mats)
    for root in roots:
        root.location = (0, 0, 0)
    show_only(roots, None, 0)


def render_sockets(scene, roots, infos, qa):
    """QA only: the three stones lying, each with a test stick tied at SOCKET_BIND (by the
    documented convention), a blue marker at GRIP and a red bar along the EDGE."""
    keys = list(VARIANTS)
    temp, mats = [], []

    def mat(col, rough=0.6):
        m = bpy.data.materials.new("_m")
        m.use_nodes = True
        p = m.node_tree.nodes["Principled BSDF"]
        p.inputs["Base Color"].default_value = (*col, 1)
        p.inputs["Roughness"].default_value = rough
        mats.append(m)
        return m

    wood, blue, red = mat((0.33, 0.21, 0.11)), mat((0.1, 0.3, 0.9), 0.3), mat((0.9, 0.1, 0.08), 0.3)

    def add(me, m, mw):
        me.materials.append(m)
        o = bpy.data.objects.new("_tmp", me)
        o.matrix_world = mw
        scene.collection.objects.link(o)
        temp.append(o)

    def cyl(r, length, segs=12):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=length)
        me = bpy.data.meshes.new("_c")
        bm.to_mesh(me)
        bm.free()
        return me

    def sphere(r):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=r)
        me = bpy.data.meshes.new("_s")
        bm.to_mesh(me)
        bm.free()
        return me

    offs = {"B": (-0.32, 0.0), "C": (0.0, 0.0), "D": (0.32, 0.0)}
    lift = 0.0
    for key, root in zip(keys, roots):
        root.location = (*offs[key], lift)            # lifted so the stick can pass under nothing
        bpy.context.view_layer.update()
        s = infos[key]["sockets"]
        W = root.matrix_world
        b = s["BIND"]
        q = socket_rotation(b["normal_blender_zup"], b["along_blender_zup"]).to_matrix().to_4x4()
        r = 0.012
        # stick axis along local X, centre offset by the radius along local Z
        stick = W @ Matrix.Translation(Vector(b["pos_blender_zup"])) @ q @ Matrix.Translation((0.0, 0, r)) \
            @ Matrix.Rotation(math.pi / 2, 4, 'Y')
        if key == "B":
            stick = stick @ Matrix.Translation((0, 0, -0.16))   # the handle extends to one side
        add(cyl(r, 0.42), wood, stick)
        add(sphere(0.007), blue, W @ Matrix.Translation(Vector(s["GRIP"]["pos_blender_zup"])))
        if "edge" in infos[key]:
            e = infos[key]["edge"]
            a, c = Vector(e["start_blender_zup"]), Vector(e["end_blender_zup"])
            mid = (a + c) / 2
            rot = Vector((0, 0, 1)).rotation_difference((c - a).normalized()).to_matrix().to_4x4()
            add(cyl(0.0025, (c - a).length, 8), red, W @ Matrix.Translation(mid) @ rot)
    show_only(roots, None, 0, temp)
    tgt = (0.0, 0.0, 0.08)
    render_view(scene, os.path.join(qa, "sockets_bind_preview.png"), orbit(-25, 38, 1.35, tgt), tgt, 50, (1800, 1000))
    for o in temp:
        me = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        bpy.data.meshes.remove(me)
    for m in mats:
        bpy.data.materials.remove(m)
    for root in roots:
        root.location = (0, 0, 0)


def import_glb_lod0(path, loc, yaw, scene):
    """Import a family GLB (read only) and keep only its LOD0 visible; returns the new objects."""
    import re
    prev = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in prev]
    for o in new:
        if o.type == 'MESH' and not re.search(r"_LOD0(\.\d+)?$", o.name):
            o.hide_render = True
    for o in new:
        if o.parent is None:
            o.location = loc
            o.rotation_mode = 'XYZ'
            o.rotation_euler = (0, 0, math.radians(yaw))
    return new


def render_family(scene, roots, out_dir, samples, assets_dir):
    """Studio line-up A, B, C, D (A read only from stone/), for the family check."""
    path = os.path.join(assets_dir, "stone", "IO_Stone_Small_A.glb")
    if not os.path.exists(path):
        return
    objs, worlds, mats = setup_studio(scene, samples)
    before = set(bpy.data.objects)
    before_m, before_i, before_me = set(bpy.data.materials), set(bpy.data.images), set(bpy.data.meshes)
    import_glb_lod0(path, (0.55, -0.35, 0), 20, scene)
    for key, root, x in zip(VARIANTS, roots, (0.22, 0.0, -0.2)):
        root.location = (x, 0.05, 0)
    show_only(roots, None, 0)
    tgt = (0.15, -0.1, 0.07)
    render_view(scene, os.path.join(out_dir, "render_family_ABCD.png"), orbit(-8, 26, 1.9, tgt), tgt, 50,
                (1920, 1080))
    for o in [o for o in bpy.data.objects if o not in before]:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in set(bpy.data.materials) - before_m:
        bpy.data.materials.remove(m)
    for im in set(bpy.data.images) - before_i:
        bpy.data.images.remove(im)
    for me in set(bpy.data.meshes) - before_me:
        bpy.data.meshes.remove(me)
    cleanup(objs, worlds, mats)
    for root in roots:
        root.location = (0, 0, 0)


def render_context(scene, roots, out_dir, samples, assets_dir):
    """QA only: A, B, C and D at the shoreline of IO_Terrain_Beach_Test_30m next to
    IO_Rock_Large_A, wet sand and a foam line, gameplay camera (40 degrees).
    Nothing of this is saved into the asset."""
    from mathutils import Quaternion
    terrain_dir = os.path.join(assets_dir, "terrain")
    if not os.path.exists(os.path.join(terrain_dir, "IO_Terrain_Beach_Test_30m.glb")):
        return
    before = set(bpy.data.objects)
    before_m, before_i, before_me = set(bpy.data.materials), set(bpy.data.images), set(bpy.data.meshes)
    for f in ("IO_Terrain_Beach_Test_30m.glb", "IO_Seafloor_Test_30m.glb"):
        p = os.path.join(terrain_dir, f)
        if os.path.exists(p):
            bpy.ops.import_scene.gltf(filepath=p)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()

    def ground(x, y):
        ok, loc, nrm, *_ = scene.ray_cast(deps, Vector((x, y, 20)), Vector((0, 0, -1)))
        return (loc.z, nrm) if ok else (None, None)

    def shore_x(y):
        xs = np.linspace(-20, 25, 451)
        hs = [ground(x, y)[0] for x in xs]
        best = None
        for i in range(len(xs) - 1):
            if hs[i] is not None and hs[i + 1] is not None and (hs[i] > 0) != (hs[i + 1] > 0):
                if best is None or abs(xs[i]) < abs(best[0]):
                    best = (xs[i], 1 if hs[i + 1] < hs[i] else -1)
        return best
    sx, sea_dir = shore_x(0.0)
    land = -sea_dir

    def place(obj, x, y, yaw, sink):
        z, n = ground(x, y)
        obj.rotation_mode = 'QUATERNION'
        tilt = Vector((0, 0, 1)).rotation_difference(n) if n else Quaternion()
        obj.rotation_quaternion = tilt @ Quaternion((0, 0, 1), math.radians(yaw))
        obj.location = (x, y, (z or 0) - sink)

    new_objs = []
    wme = bpy.data.meshes.new("_water")
    wme.from_pydata([(-60, -60, 0.0), (60, -60, 0.0), (60, 60, 0.0), (-60, 60, 0.0)], [], [(0, 1, 2, 3)])
    wm = bpy.data.materials.new("_water")
    wm.use_nodes = True
    p = wm.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.20, 0.62, 0.66, 1)
    p.inputs["Roughness"].default_value = 0.04
    p.inputs["Transmission Weight"].default_value = 0.92
    p.inputs["IOR"].default_value = 1.33
    wme.materials.append(wm)
    wo = bpy.data.objects.new("_water", wme)
    scene.collection.objects.link(wo)
    new_objs.append(wo)
    ys = np.linspace(-10, 10, 81)
    shore = []
    for y in ys:
        r = shore_x(float(y))
        shore.append(r[0] if r else sx)

    def band(name, offs, lift, m):
        verts, faces = [], []
        for y, xw in zip(ys, shore):
            for o in offs:
                x = xw + o
                z, _ = ground(x, float(y))
                verts.append((x, float(y), max(z if z is not None else 0.0, 0.0) + lift))
        n = len(offs)
        for i in range(len(ys) - 1):
            for k in range(n - 1):
                faces.append((i * n + k, (i + 1) * n + k, (i + 1) * n + k + 1, i * n + k + 1))
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        uvl = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                uvl.data[li].uv = ((vi % n) / (n - 1), vi // n / (len(ys) - 1))
        me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        scene.collection.objects.link(ob)
        new_objs.append(ob)

    def band_material(name, color, rough, edge_noise, fade):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        pb = nt.nodes["Principled BSDF"]
        pb.inputs["Base Color"].default_value = (*color, 1)
        pb.inputs["Roughness"].default_value = rough
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 2.2
        nz.inputs["Detail"].default_value = 8.0
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        sp = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["UV"], sp.inputs["Vector"])
        prof = nt.nodes.new("ShaderNodeFloatCurve")
        cm = prof.mapping
        cm.curves[0].points[0].location = (0.0, fade[0])
        cm.curves[0].points[1].location = (1.0, fade[2])
        cm.curves[0].points.new(0.35, fade[1])
        cm.update()
        nt.links.new(sp.outputs["X"], prof.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = 'MULTIPLY'
        rr = nt.nodes.new("ShaderNodeMapRange")
        rr.inputs["From Min"].default_value = edge_noise[0]
        rr.inputs["From Max"].default_value = edge_noise[1]
        nt.links.new(nz.outputs["Fac"], rr.inputs["Value"])
        nt.links.new(prof.outputs["Value"], mul.inputs[0])
        nt.links.new(rr.outputs["Result"], mul.inputs[1])
        nt.links.new(mul.outputs["Value"], pb.inputs["Alpha"])
        return m

    band("_wet", [land * o for o in (-0.1, 0.3, 0.7, 1.1, 1.5)], 0.003,
         band_material("_wet", (0.40, 0.28, 0.18), 0.25, (0.12, 0.42), (1.0, 0.92, 0.0)))
    band("_foam", [land * o for o in (-0.55, -0.3, -0.1, 0.05, 0.18)], 0.012,
         band_material("_foam", (0.95, 0.97, 0.98), 0.6, (0.45, 0.62), (0.0, 1.0, 0.0)))
    # props after the sand bands, so the bands are not draped over the rock
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    rx = sx + land * 2.6                                            # rock 2.6 m landward of the waterline
    rock = os.path.join(assets_dir, "rock", "glb", "IO_Rock_Large_A.glb")
    if os.path.exists(rock):
        new = import_glb_lod0(rock, (0, 0, 0), 0, scene)
        place([o for o in new if o.parent is None][0], rx - land * 1.4, 1.2, 30, 0.05)
    sa = os.path.join(assets_dir, "stone", "IO_Stone_Small_A.glb")
    if os.path.exists(sa):
        new = import_glb_lod0(sa, (0, 0, 0), 0, scene)
        place([o for o in new if o.parent is None][0], rx - land * 0.05, 0.1, -25, 0.004)
    places = {"B": (rx + land * 0.45, -0.3, 40), "C": (rx - land * 0.2, -0.65, -15), "D": (rx + land * 0.55, 0.45, 70)}
    for key, root in zip(VARIANTS, roots):
        x, y, yaw = places[key]
        place(root, x, y, yaw, 0.002)
    show_only(roots, None, 0)
    world = bpy.data.worlds.new("_sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.72, 0.92, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.2
    scene.world = world
    sd = bpy.data.lights.new("_sun", 'SUN')
    sd.energy = 4.5
    sd.angle = math.radians(5)
    sd.color = (1.0, 0.93, 0.82)
    so = bpy.data.objects.new("_sun", sd)
    so.rotation_euler = Vector((-0.5, 0.6, -0.65)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(so)
    cam = bpy.data.objects.new("_cam", bpy.data.cameras.new("_cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    new_objs += [so, cam]
    scene.cycles.samples = samples
    cx = rx - land * 0.4
    tgt = (cx, 0.45, 0.45)
    a = math.radians(40)
    d = 6.8
    loc = (cx + land * d * math.cos(a) * 0.82, 0.45 - d * math.cos(a) * 0.57, 0.45 + d * math.sin(a))
    render_view(scene, os.path.join(out_dir, "qa", "context_shoreline_gameplay.png"), loc, tgt, 40, (1920, 1080))
    for o in new_objs:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in [o for o in bpy.data.objects if o not in before]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.worlds.remove(world)
    for m in set(bpy.data.materials) - before_m:
        bpy.data.materials.remove(m)
    for im in set(bpy.data.images) - before_i:
        bpy.data.images.remove(im)
    for me in set(bpy.data.meshes) - before_me:
        bpy.data.meshes.remove(me)
    for dat in list(bpy.data.lights) + list(bpy.data.cameras):
        if dat.users == 0:
            (bpy.data.lights if isinstance(dat, bpy.types.Light) else bpy.data.cameras).remove(dat)
    scene.world = None
    for root in roots:
        root.rotation_mode = 'XYZ'
        root.rotation_euler = (0, 0, 0)
        root.location = (0, 0, 0)


# ---------------------------------------------------------------------------
# Check
# ---------------------------------------------------------------------------
def bmesh_islands(bm):
    seen, islands = set(), []
    for v in bm.verts:
        if v in seen:
            continue
        stack, isl = [v], []
        seen.add(v)
        while stack:
            x = stack.pop()
            isl.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        islands.append(isl)
    return islands


def verify_glb(path, info, v):
    """Re-import the GLB into an empty scene and check scale, orientation, normals, UVs,
    materials, pivot, LOD names and budgets, collision and sockets."""
    asset = info["asset"]
    js, _ = read_glb_json(path)
    bpy.ops.wm.read_homefile(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = {o.name: o for o in bpy.data.objects}
    root = objs.get(asset)
    if not root:
        return ["no root node"], {}
    problems, res = [], {}
    if root.get("asset_id") != asset or root.get("shape") != v["sim_shape"]:
        problems.append("metadata")
    if root.location.length > 1e-4 or abs(root.scale.x - 1) > 1e-4 or root.rotation_euler.to_quaternion().angle > 1e-4:
        problems.append("root transform")
    tx, ty, tz = v["size"]
    for li in range(len(LODS)):
        o = objs.get(f"{asset}_LOD{li}")
        if not o or o.type != 'MESH':
            problems.append(f"LOD{li} missing")
            continue
        if o.location.length > 1e-5 or o.rotation_euler.to_quaternion().angle > 1e-5 or abs(o.scale.x - 1) > 1e-5:
            problems.append(f"LOD{li} transform not applied")
        me = o.data
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        lo, hi = TRI_BUDGET[li]
        if not lo <= n <= hi:
            problems.append(f"LOD{li} {n} tris")
        if not me.uv_layers:
            problems.append(f"LOD{li} no UVs")
        else:
            uvs = np.empty(len(me.uv_layers[0].data) * 2, dtype=np.float32)
            me.uv_layers[0].data.foreach_get("uv", uvs)
            if uvs.min() < -1e-4 or uvs.max() > 1 + 1e-4:
                problems.append(f"LOD{li} UVs outside 0-1")
        mat = o.material_slots[0].material if o.material_slots else None
        if not mat or not mat.name.startswith(MATERIAL_NAME):
            problems.append(f"LOD{li} material")
        elif sum(1 for nd in mat.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image) < 3:
            problems.append(f"LOD{li} textures")
        ws = [o.matrix_world @ vv.co for vv in me.vertices]
        zs = [p.z for p in ws]
        w = max(p.x for p in ws) - min(p.x for p in ws)
        d = max(p.y for p in ws) - min(p.y for p in ws)
        hgt = max(zs)
        for label, got, want in (("width x", w, tx), ("depth y", d, ty), ("height z", hgt, tz)):
            if abs(got - want) > 0.12 * want + 0.003:            # Z-up after import = correct orientation
                problems.append(f"LOD{li} {label} {got:.3f} (target {want})")
        if not (-EMBED - 0.002 < min(zs) < 0.0):
            problems.append(f"LOD{li} bottom {min(zs):.4f}")
        cx = (max(p.x for p in ws) + min(p.x for p in ws)) / 2
        cy = (max(p.y for p in ws) + min(p.y for p in ws)) / 2
        if math.hypot(cx, cy) > 0.006:
            problems.append(f"LOD{li} origin off-centre")
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
        if bm.calc_volume(signed=True) <= 0:
            problems.append(f"LOD{li} normals")
        if any(not e.is_manifold for e in bm.edges):
            problems.append(f"LOD{li} not closed")
        isl = len(bmesh_islands(bm))
        if isl != 1:
            problems.append(f"LOD{li} {isl} pieces")
        bm.free()
        res[f"LOD{li}"] = dict(tris=n, size_m=[round(w, 3), round(d, 3), round(hgt, 3)], bottom_m=round(min(zs), 4))
    c = objs.get(f"{asset}_COL")
    if not c or c.type != 'MESH':
        problems.append("no collider")
    else:
        cm = c.data
        nt = sum(len(p.vertices) - 2 for p in cm.polygons)
        if nt >= COLLIDER_MAX_TRIS + 1:
            problems.append(f"collider {nt} tris")
        bm = bmesh.new()
        bm.from_mesh(cm)
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
        bm.normal_update()
        convex = all((vv.co - f.calc_center_median()).dot(f.normal) < 1e-5 for f in bm.faces for vv in bm.verts)
        closed = all(e.is_manifold for e in bm.edges)
        bm.free()
        if not (convex and closed):
            problems.append("collider not convex/closed")
        if cm.materials and any(cm.materials):
            problems.append("collider has a material")
        res["collider"] = dict(tris=nt, convex=convex, closed=closed)
    want = {"SOCKET_GRIP", "SOCKET_BIND"} | ({"SOCKET_EDGE"} if v["shape"] != "round" else set())
    found = {nm for nm in objs if nm.startswith("SOCKET_")}
    res["sockets_found"] = sorted(found)
    if found != want:
        problems.append(f"sockets {sorted(found)}")
    for nm in want & found:
        e = objs[nm]
        exp = info["sockets"][nm[7:]]["pos_blender_zup"]
        if (e.matrix_world.translation - Vector(exp)).length > 1e-3:
            problems.append(f"{nm} position")
        zl = e.matrix_world.to_quaternion() @ Vector((0, 0, 1))
        if zl.dot(Vector(info["sockets"][nm[7:]]["normal_blender_zup"])) < 0.99:
            problems.append(f"{nm} orientation")
    mats = {m.get("name") for m in js.get("materials", [])}
    res["gltf_materials"] = sorted(mats)
    res["gltf_images"] = len(js.get("images", []))
    if mats != {MATERIAL_NAME}:
        problems.append(f"glTF materials {mats}")
    if js.get("asset", {}).get("extras", {}).get("third_party_assets") is not False:
        problems.append("copyright extras")
    return problems, res


def main(out_dir, render=False, save_blend=True, samples=64, ref_path=None, assets_dir=None):
    tex_dir = os.path.join(out_dir, "textures")
    os.makedirs(tex_dir, exist_ok=True)
    bpy.ops.wm.read_homefile(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 32
    c_nature = collection("IslandOne_Nature")
    c_family = collection(FAMILY, c_nature)
    roots, infos = [], {}
    for key, v in VARIANTS.items():
        root, info = build_variant(key, v, c_family, tex_dir)
        roots.append(root)
        infos[key] = info
        export_glb(root, os.path.join(out_dir, f"{FAMILY}_{key}.glb"))
    if render:
        render_all(scene, roots, infos, out_dir, samples, ref_path)
        if assets_dir:
            render_family(scene, roots, out_dir, samples, assets_dir)
            render_context(scene, roots, out_dir, samples, assets_dir)
    # .blend: variants side by side for viewing (each is exported at the origin), LOD1/2 and COL hidden
    for k, root in enumerate(roots):
        root.location = (0.25 * k, 0, 0)
        for ch in root.children:
            if ch.get("lod") in (1, 2) or ch.name.endswith("_COL"):
                ch.hide_set(True)
                ch.hide_render = True
    bpy.data.orphans_purge(do_recursive=True)
    if save_blend:
        for img in bpy.data.images:
            if img.filepath_raw and not img.packed_file:
                img.pack()
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "islandone_stone_bcd.blend"), relative_remap=True)
    failed = 0
    for key, v in VARIANTS.items():
        path = os.path.join(out_dir, f"{FAMILY}_{key}.glb")
        problems, res = verify_glb(path, infos[key], v)
        infos[key]["glb_kb"] = round(os.path.getsize(path) / 1024)
        infos[key]["reimport_check"] = dict(ok=not problems, problems=problems, **res)
        if problems:
            failed += 1
            print(f"[stone_bcd] re-import check FAILED {key}: {', '.join(problems)}")
    manifest = {
        "family": FAMILY, "variants": list(VARIANTS), "kit": KIT_ID, "sim_kind": "stones",
        "units": "metres", "up_axis_blender": "Z", "up_axis_gltf": "Y",
        "axes": "long axis +X; C and D: cutting edge at the front (+Y), thick back at -Y (glTF: edge at -Z)",
        "origin": f"footprint centre at ground level (Z = 0, glTF y = 0); the underside reaches {EMBED} m below ground",
        "material": MATERIAL_NAME, "material_count_per_glb": 1,
        "material_note": "one material IO_MAT_Rock_Gray (rock family shader), one baked texture set per LOD; "
                         "in the GLB three material entries with this name, one per LOD",
        "texture_px_per_lod": [l["tex"] for l in LODS], "textures_per_lod": ["BaseColor", "Roughness (G)", "Normal"],
        "gltf_image_format": "JPEG q90",
        "lod_max_distance_m": [l["max_dist"] for l in LODS], "cull_distance_m": CULL_DISTANCE,
        "triangle_budget": TRI_BUDGET, "collider_max_triangles": COLLIDER_MAX_TRIS,
        "wetness": WET,
        "socket_convention": "empties SOCKET_<NAME>; local +Z (glTF +Y) = socket normal, local +X = along "
                             "(BIND: stick direction, EDGE: edge direction, GRIP: stone long axis)",
        "copyright": COPYRIGHT, "credits": CREDITS,
        "assets": {f"{FAMILY}_{k}": infos[k] for k in VARIANTS},
    }
    with open(os.path.join(out_dir, "stone_bcd.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[stone_bcd] {len(VARIANTS)} stones x {len(LODS)} LODs -> {out_dir}, "
          f"re-import check: {len(VARIANTS) - failed}/{len(VARIANTS)} ok")
    print(json.dumps({k: dict(dims=i["dimensions_m"], tris=[l["triangles"] for l in i["lods"]],
                              col=i["collision"]["triangles"], edge=i.get("edge", {}).get("edge_angle_deg"),
                              check=i["reimport_check"]["problems"]) for k, i in infos.items()}, indent=1))
    return manifest


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]

    def arg(name, default=None):
        return argv[argv.index(name) + 1] if name in argv else default
    out = os.path.abspath(arg("--out", os.path.dirname(os.path.abspath(__file__))))
    ref = arg("--ref")
    assets = arg("--assets")
    main(out, render="--render" in argv, save_blend="--no-blend" not in argv, samples=int(arg("--samples", 64)),
         ref_path=os.path.abspath(ref) if ref else None, assets_dir=os.path.abspath(assets) if assets else None)
