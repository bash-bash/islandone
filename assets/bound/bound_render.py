"""
IslandOne - QA renders for IO_Bound_A (called by islandone_bound.py --render).

All renders load the exported GLBs into a fresh scene, so they show exactly what ships.
Studio: neutral light-grey background, the same sun and settings as the other IslandOne assets.
Context: QA only, nothing of it is part of the asset.
"""

import bpy
import json
import math
import os
import numpy as np
from mathutils import Matrix, Vector, Quaternion

FAMILY = "IO_Bound_A"
VARIANTS = ("StickStone", "StickStick")


# ---------------------------------------------------------------------------
# Studio (same as IO_Stone_Small_B/C/D, IO_Branch_A/B)
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
    return sun, g


def render_view(scene, path, loc, target, lens=50, res=(1600, 1200)):
    cam = scene.camera
    cam.data.lens = lens
    cam.data.clip_start = 0.005
    cam.data.clip_end = 400
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def orbit(deg, elev_deg, dist, target):
    """deg 0 = camera in front (-Y, the side the stone's edge faces), 90 = camera at +X (head end)."""
    a, e = math.radians(deg), math.radians(elev_deg)
    return (target[0] + dist * math.cos(e) * math.sin(a), target[1] - dist * math.cos(e) * math.cos(a),
            target[2] + dist * math.sin(e))


# ---------------------------------------------------------------------------
# Image helpers (numpy only, so this also runs inside Blender without Pillow)
# ---------------------------------------------------------------------------
def load_np(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    cs = im.colorspace_settings.name
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


def to_h(a, h):
    return resize(a, h, int(round(a.shape[1] * h / a.shape[0])))


def hstack(arrs, gap=24):
    h = max(a.shape[0] for a in arrs)
    out = []
    for i, a in enumerate(arrs):
        if a.shape[0] < h:
            a = np.concatenate([a, np.ones((h - a.shape[0], a.shape[1], 4), np.float32)], 0)
        out.append(a)
        if i < len(arrs) - 1:
            out.append(np.ones((h, gap, 4), np.float32))
    return np.concatenate(out, 1)


def vstack(arrs, gap=24):
    w = max(a.shape[1] for a in arrs)
    out = []
    for i, a in enumerate(arrs):
        if a.shape[1] < w:
            pad = w - a.shape[1]
            a = np.concatenate([np.ones((a.shape[0], pad // 2, 4), np.float32), a,
                                np.ones((a.shape[0], pad - pad // 2, 4), np.float32)], 1)
        out.append(a)
        if i < len(arrs) - 1:
            out.append(np.ones((gap, w, 4), np.float32))
    return np.concatenate(out, 0)


def contact_sheet(tiles, cols, path):
    arrs = [load_np(t) for t in tiles]
    h, w = arrs[0].shape[:2]
    rows = math.ceil(len(arrs) / cols)
    sheet = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for i, a in enumerate(arrs):
        r, c = divmod(i, cols)
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = a
    save_np(sheet, path)
    for t in tiles:
        os.remove(t)


# ---------------------------------------------------------------------------
# Scene content
# ---------------------------------------------------------------------------
def import_root(path, name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects[name]
    for o in new:
        if o.name.endswith("_COL") or o.type == 'EMPTY' and o is not root:
            o.hide_render = True
    return root


def show_lod(root, lod, morph=0.0):
    for ch in root.children:
        if ch.type != 'MESH':
            continue
        if ch.name.endswith("_COL"):
            ch.hide_render = True
            continue
        ch.hide_render = not ch.name.endswith(f"_LOD{lod}")
        if ch.data.shape_keys and "Loose" in ch.data.shape_keys.key_blocks:
            ch.data.shape_keys.key_blocks["Loose"].value = morph


def hide_all(roots):
    for r in roots:
        for ch in r.children:
            ch.hide_render = True


def import_glb_objects(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


# ---------------------------------------------------------------------------
# Renders
# ---------------------------------------------------------------------------
def render_all(out_dir, assets, glbs, metas, samples, quick=False):
    bpy.ops.wm.read_homefile(use_empty=True)
    scene = bpy.context.scene
    sun, ground = setup_studio(scene, samples)
    qa = os.path.join(out_dir, "qa")
    os.makedirs(qa, exist_ok=True)
    roots = {v: import_root(glbs[v], f"{FAMILY}_{v}") for v in VARIANTS}
    # hero: both side by side
    roots["StickStone"].location = (0, -0.20, 0)
    roots["StickStick"].location = (-0.15, 0.55, 0)
    for v in VARIANTS:
        show_lod(roots[v], 0)
    tgt = (0.15, 0.15, 0.03)
    render_view(scene, os.path.join(out_dir, "render_hero.png"), orbit(-25, 28, 2.1, tgt), tgt, 50, (1920, 1080))
    render_view(scene, os.path.join(out_dir, "render_compare_gameplay.png"), orbit(20, 40, 2.4, tgt), tgt, 50, (1600, 1200))
    for v in VARIANTS:
        roots[v].location = (0, 0, 0)
    for v in VARIANTS:
        hide_all(roots.values())
        show_lod(roots[v], 0)
        m = metas[v]
        mn, mx = Vector(m["bbox_min_m"]), Vector(m["bbox_max_m"])
        c = (mn + mx) / 2
        t = (c.x, c.y, (mx.z - mn.z) * 0.35)
        L = max(mx.x - mn.x, mx.y - mn.y)
        dist = 1.75 * L + 0.1
        name = f"{FAMILY}_{v}"
        views = [("1_three_quarter_front", orbit(-35, 24, dist, t), (1600, 1200)),
                 ("2_three_quarter_back", orbit(145, 24, dist, t), (1600, 1200)),
                 ("3_side", orbit(0, 4, dist, t), (1800, 900)),
                 ("4_gameplay_40deg", orbit(25, 40, dist * 1.1, t), (1600, 1200))]
        for vname, loc, res in views:
            render_view(scene, os.path.join(qa, f"{name}_{vname}.png"), loc, t, 50, res)
        tiles = []
        for k, deg in enumerate(list(range(0, 360, 45)) + ["above"]):
            loc = orbit(0, 89.5, dist * 1.1, t) if deg == "above" else orbit(deg, 40, dist * 1.1, t)
            tp = os.path.join(qa, f"_tile_{k}.png")
            render_view(scene, tp, loc, t, 50, (720, 540))
            tiles.append(tp)
        contact_sheet(tiles, 3, os.path.join(qa, f"{name}_5_360.png"))
        # LODs: upper row close, lower row at the distance where each LOD is used (gameplay camera)
        tiles = []
        for li in range(3):
            show_lod(roots[v], li)
            tp = os.path.join(qa, f"_lod_{li}.png")
            render_view(scene, tp, orbit(-35, 30, dist, t), t, 50, (800, 600))
            tiles.append(tp)
        for li, dm in enumerate((5.0, 15.0, 35.0)):
            show_lod(roots[v], li)
            tp = os.path.join(qa, f"_lodg_{li}.png")
            render_view(scene, tp, orbit(25, 40, dm, t), t, 50 * dm / (dist * 2.2), (800, 600))
            tiles.append(tp)
        contact_sheet(tiles, 3, os.path.join(qa, f"{name}_6_lods.png"))
        show_lod(roots[v], 0)
        # 7: side by side with the references: the parts' own QA renders (same camera) and the island image
        tp = os.path.join(qa, "_ref.png")
        render_view(scene, tp, orbit(-35, 24, dist, t), t, 50, (1600, 1200))
        ours = to_h(load_np(tp), 720)
        os.remove(tp)
        tp = os.path.join(qa, "_ref_close.png")
        jt = metas[v]["sockets"]["JOINT"]["pos_blender"]
        render_view(scene, tp, orbit(-35, 30, 0.42, jt), jt, 50, (1600, 1200))
        close = to_h(load_np(tp), 720)
        os.remove(tp)
        refs = [os.path.join(assets, "branch", "qa", "IO_Branch_A_1_three_quarter_front.png")]
        if v == "StickStone":
            refs.append(os.path.join(assets, "stone", "qa", "IO_Stone_Small_D_1_three_quarter_front.png"))
        refs.append(os.path.join(assets, "fiber", "render_context_crossed_poles.png"))
        island = os.path.join(assets, "..", "docs", "Tropisches Inselcamp am Strand.png")
        for cand in (island, os.path.join(out_dir, "refs", "Tropisches Inselcamp am Strand.png")):
            if os.path.exists(cand):
                island = cand
                break
        row2 = [to_h(load_np(r), 480) for r in refs if os.path.exists(r)]
        top = [ours, close]
        if os.path.exists(island):
            top.append(to_h(load_np(island), 720))
        save_np(vstack([hstack(top), hstack(row2)]), os.path.join(qa, f"{name}_7_vs_reference.png"))
        # 8: runtime states: lying (as exported), weak joint (Loose = 1), held (GRIP up, as in the hand)
        tiles = []
        for morph in (0.0, 1.0):
            show_lod(roots[v], 0, morph)
            tp = os.path.join(qa, f"_st_{morph}.png")
            render_view(scene, tp, orbit(-30, 35, 0.5, jt), jt, 50, (900, 675))
            tiles.append(tp)
        show_lod(roots[v], 0, 0.0)
        g = Vector(metas[v]["sockets"]["GRIP"]["pos_blender"])
        q = Quaternion(metas[v]["sockets"]["GRIP"]["rot_gltf_xyzw"][3:] + metas[v]["sockets"]["GRIP"]["rot_gltf_xyzw"][:3])
        # held: hand at 0.75 m, haft pointing forward and slightly down (as the arm hangs)
        roots[v].matrix_world = Matrix.Translation((0, 0, 0.75)) @ Matrix.Rotation(math.radians(-25), 4, 'Y') \
            @ Matrix.Translation(-g)
        tp = os.path.join(qa, "_st_held.png")
        tc = (0.25, 0.0, 0.85)
        render_view(scene, tp, orbit(-30, 20, 1.6, tc), tc, 50, (900, 675))
        tiles.append(tp)
        roots[v].matrix_world = Matrix.Identity(4)
        contact_sheet(tiles, 3, os.path.join(qa, f"{name}_8_states.png"))
        hide_all(roots.values())
    for v in VARIANTS:
        show_lod(roots[v], 0)
    render_context(scene, roots, out_dir, assets, metas, samples, sun, ground)


def render_context(scene, roots, out_dir, assets, metas, samples, sun, ground):
    """QA only: both variants lying on the beach sand at the camp, next to IO_Character_A for scale,
    with a few camp props (IO_Campfire_Stone_A ring, IO_Log_Short_A). Gameplay camera (40 deg) and close."""
    terrain = os.path.join(assets, "terrain", "IO_Terrain_Beach_Test_30m.glb")
    if not os.path.exists(terrain):
        print("context render skipped: terrain missing")
        return
    import_glb_objects(terrain)
    ground.hide_render = True
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()

    def gz(x, y):
        ok, loc, nrm, *_ = scene.ray_cast(deps, Vector((x, y, 30)), Vector((0, 0, -1)))
        return (loc.z, nrm) if ok else (0.0, Vector((0, 0, 1)))

    # dry sand: the first spot along -Y..+Y and X where the beach is 0.5-1.2 m above the sea
    spot = None
    for x in np.linspace(-12, 12, 49):
        for y in np.linspace(-8, 8, 17):
            z, n = gz(float(x), float(y))
            if 0.5 < z < 1.2 and n.z > 0.985:
                spot = (float(x), float(y))
                break
        if spot:
            break
    spot = spot or (0.0, 0.0)
    # sea
    wme = bpy.data.meshes.new("_water")
    wme.from_pydata([(-80, -80, 0.0), (80, -80, 0.0), (80, 80, 0.0), (-80, 80, 0.0)], [], [(0, 1, 2, 3)])
    wm = bpy.data.materials.new("_water")
    wm.use_nodes = True
    p = wm.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (0.20, 0.62, 0.66, 1)
    p.inputs["Roughness"].default_value = 0.04
    p.inputs["Transmission Weight"].default_value = 0.92
    wme.materials.append(wm)
    scene.collection.objects.link(bpy.data.objects.new("_water", wme))

    def place(root, x, y, yaw):
        z, n = gz(x, y)
        root.rotation_mode = 'QUATERNION'
        root.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(n) @ Quaternion((0, 0, 1), math.radians(yaw))
        root.location = (x, y, z)

    sx, sy = spot
    place(roots["StickStone"], sx + 0.05, sy - 0.15, 20)
    place(roots["StickStick"], sx - 0.55, sy + 0.45, -35)
    # character for scale, standing next to the tools
    ch = os.path.join(assets, "character", "IO_Character_A.glb")
    if os.path.exists(ch):
        objs = import_glb_objects(ch)
        arm = next((o for o in objs if o.type == 'ARMATURE'), None)
        top = [o for o in objs if o.parent is None]
        for o in top:
            z, _ = gz(sx + 1.05, sy + 0.55)
            o.location = (sx + 1.05, sy + 0.55, z)
            o.rotation_mode = 'XYZ'
            o.rotation_euler = (o.rotation_euler[0], o.rotation_euler[1], math.radians(-120))
        if arm and arm.animation_data and arm.animation_data.action:
            scene.frame_set(1)
    # camp props
    camp = os.path.join(assets, "campfire_stone", "IO_Campfire_Stone_A.glb")
    if os.path.exists(camp):
        for k in range(7):
            a = 2 * math.pi * k / 7
            objs = import_glb_objects(camp)
            r = [o for o in objs if o.parent is None][0]
            for o in objs:
                if o.name.endswith(("_LOD1", "_LOD2", "_COL")) or o.type == 'EMPTY' and o is not r:
                    o.hide_render = True
            cx, cy = sx - 0.9, sy - 1.0
            z, _ = gz(cx + 0.38 * math.cos(a), cy + 0.38 * math.sin(a))
            r.location = (cx + 0.38 * math.cos(a), cy + 0.38 * math.sin(a), z)
            r.rotation_euler = (0, 0, a + 1.3)
    log = os.path.join(assets, "log", "IO_Log_Short_A.glb")
    if os.path.exists(log):
        objs = import_glb_objects(log)
        r = [o for o in objs if o.parent is None][0]
        for o in objs:
            if o.name.endswith(("_LOD1", "_LOD2", "_COL")) or o.type == 'EMPTY' and o is not r:
                o.hide_render = True
        z, _ = gz(sx + 0.2, sy - 1.6)
        r.location = (sx + 0.2, sy - 1.6, z)
        r.rotation_euler = (0, 0, math.radians(15))
    sun.data.energy = 4.5
    t = (sx, sy + 0.1, gz(sx, sy)[0] + 0.25)
    render_view(scene, os.path.join(out_dir, "qa", "context_camp_gameplay.png"), orbit(20, 40, 5.0, t), t, 50, (1920, 1080))
    t2 = (sx + 0.3, sy + 0.2, gz(sx, sy)[0] + 0.35)
    render_view(scene, os.path.join(out_dir, "qa", "context_camp_close.png"), orbit(-20, 30, 3.0, t2), t2, 50, (1920, 1080))
