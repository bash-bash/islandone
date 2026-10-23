"""Prüft eine animierte Figur (GLB mit Mixamo-Skelett) auf typische Rig- und Animationsfehler.

Aufruf (Blender 4.2+ oder `pip install bpy`):

    blender -b -P check_character.py -- IO_Character_A.glb [--manifest character.json]
            [--anims source_anims/] [--json report.json]
    python check_character.py IO_Character_A.glb ...          # mit bpy als Python-Modul

Exit-Code 1, wenn ein Check FAIL meldet. Gemessen wird nur über Gelenkpositionen und
Rotationsdifferenzen zur Ruhepose, damit die Ergebnisse nicht davon abhängen, wie der
glTF-Import die Knochenachsen rät.

Checks:
  struktur      ein Armature, Mixamo-Knochen, geskinnte Meshes, alle Clips aus dem Manifest
  massstab      Höhe, Füße auf dem Boden, Pivot mittig
  skin          max. 4 Einflüsse, Gewichtssumme 1, keine Vertices ohne Gewicht
  arme          "arms" pro Clip im Manifest: "relaxed" (Stehen) = Hände nicht weit vor der
                Schulter und nicht über die Körpermitte; "swing" (Gehen) = nur Körpermitte;
                "carry"/"free" = keine Vorgabe
  verdrehung    Unterarm- und Handtwist gegenüber dem Elternknochen (Bonbonpapier-Effekt)
  knie          Knie knicken nicht nach hinten durch
  root_motion   In-place-Clips bleiben am Ort
  quelle        (mit --anims) Gelenkrichtungen stimmen mit der Mixamo-Quelle überein
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

P = "mixamorig:"
REQUIRED_BONES = [
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
]
# Gelenkketten, deren Richtung (Gelenk -> nächstes Gelenk) mit der Quelle verglichen wird.
CHAINS = [
    ("Spine", "Spine1"), ("Spine1", "Spine2"), ("Spine2", "Neck"), ("Neck", "Head"),
    ("LeftShoulder", "LeftArm"), ("LeftArm", "LeftForeArm"), ("LeftForeArm", "LeftHand"),
    ("RightShoulder", "RightArm"), ("RightArm", "RightForeArm"), ("RightForeArm", "RightHand"),
    ("LeftUpLeg", "LeftLeg"), ("LeftLeg", "LeftFoot"), ("RightUpLeg", "RightLeg"), ("RightLeg", "RightFoot"),
]
SAMPLES = 16  # Frames pro Clip

# Grenzwerte, als Anteil der Armlänge (Schulter bis Handgelenk) bzw. in Grad und Metern
LIMITS = {
    "height_m": (1.55, 1.95),
    "ground_m": 0.03,
    "pivot_m": 0.10,
    "relaxed_hand_forward": 0.40,   # Hand max. so weit vor dem Schultergelenk (Anteil Armlänge)
    "relaxed_hand_midline": 0.05,   # Hand nicht weiter als so (m) über die Körpermitte
    "twist_warn_deg": 100.0,
    "twist_fail_deg": 140.0,
    "knee_back_m": 0.02,            # Knie max. so weit hinter der Linie Hüfte-Knöchel
    "in_place_m": 0.15,
    "source_warn_deg": 3.0,
    "source_fail_deg": 10.0,
}


class Report:
    def __init__(self):
        self.rows = []

    def add(self, check, level, msg, clip=None):
        self.rows.append({"check": check, "level": level, "clip": clip, "msg": msg})

    def failed(self):
        return any(r["level"] == "FAIL" for r in self.rows)

    def print(self):
        for r in self.rows:
            where = f"[{r['clip']}] " if r["clip"] else ""
            print(f"{r['level']:4s}  {r['check']:11s} {where}{r['msg']}")
        n = {lvl: sum(r["level"] == lvl for r in self.rows) for lvl in ("PASS", "WARN", "FAIL")}
        print(f"\n{n['PASS']} PASS, {n['WARN']} WARN, {n['FAIL']} FAIL")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    opts = {"glb": None, "manifest": None, "anims": None, "json": None}
    it = iter(argv)
    for a in it:
        if a.startswith("--"):
            opts[a[2:]] = next(it)
        else:
            opts["glb"] = a
    if not opts["glb"]:
        sys.exit(__doc__)
    if not opts["manifest"]:
        guess = os.path.join(os.path.dirname(os.path.abspath(opts["glb"])), "character.json")
        opts["manifest"] = guess if os.path.exists(guess) else None
    return opts


def joint(arm, name):
    """Gelenkposition (Kopf des Knochens) in Weltkoordinaten, aktuelle Pose."""
    pb = arm.pose.bones.get(P + name)
    return arm.matrix_world @ pb.head


def rest_joint(arm, name):
    return arm.matrix_world @ arm.data.bones[P + name].head_local


def body_frame(arm):
    """Rechts-, Vorwärts- und Hochachse des Körpers aus den Hüftgelenken (Blick nach vorn)."""
    right = joint(arm, "RightUpLeg") - joint(arm, "LeftUpLeg")
    right.z = 0
    right.normalize()
    up = Vector((0, 0, 1))
    forward = up.cross(right).normalized()
    return right, forward, up


def world_delta(arm, name):
    """Rotation des Knochens gegenüber seiner Ruhelage, im Weltraum."""
    pb = arm.pose.bones[P + name]
    pose = (arm.matrix_world @ pb.matrix).to_quaternion()
    rest = (arm.matrix_world @ arm.data.bones[P + name].matrix_local).to_quaternion()
    return pose @ rest.inverted()


def twist_deg(arm, child, parent, axis_from, axis_to):
    """Drehung des Kindknochens um seine eigene Längsachse relativ zum Elternknochen."""
    rel = world_delta(arm, parent).inverted() @ world_delta(arm, child)  # in Ruhelage-Weltraum
    axis = (rest_joint(arm, axis_to) - rest_joint(arm, axis_from)).normalized()
    v = Vector((rel.x, rel.y, rel.z))
    proj = axis * v.dot(axis)
    ang = 2 * math.atan2(proj.dot(axis), rel.w)
    ang = (ang + math.pi) % (2 * math.pi) - math.pi
    return abs(math.degrees(ang))


def sample_frames(action, n=SAMPLES):
    f0, f1 = action.frame_range
    if f1 <= f0:
        return [int(f0)]
    return sorted({int(round(f0 + (f1 - f0) * i / (n - 1))) for i in range(n)})


def set_frame(f):
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()


# ---------------------------------------------------------------------------

def check_structure(rep, arm, meshes, manifest):
    names = {b.name for b in arm.data.bones}
    missing = [b for b in REQUIRED_BONES if P + b not in names]
    if missing:
        rep.add("struktur", "FAIL", f"Knochen fehlen: {', '.join(missing)}")
        return False
    rep.add("struktur", "PASS", f"{len(names)} Knochen, Mixamo-Namen vollständig")
    skinned = [m for m in meshes if any(md.type == "ARMATURE" for md in m.modifiers)]
    if not skinned:
        rep.add("struktur", "FAIL", "kein geskinntes Mesh")
    else:
        tris = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in skinned)
        rep.add("struktur", "PASS", f"{len(skinned)} geskinnte(s) Mesh(es), {tris} Dreiecke")
    if manifest:
        want = [a["name"] for a in manifest.get("animations", [])]
        have = {a.name for a in bpy.data.actions}
        miss = [w for w in want if w not in have]
        rep.add("struktur", "FAIL" if miss else "PASS",
                f"Clips fehlen: {', '.join(miss)}" if miss else f"alle {len(want)} Clips aus dem Manifest vorhanden")
    return True


def check_scale(rep, arm, meshes, manifest):
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for m in meshes:
        ev = m.evaluated_get(dg)
        me = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    h = hi.z - lo.z
    want = manifest.get("height_m") if manifest else None
    lo_h, hi_h = LIMITS["height_m"]
    ok = lo_h <= h <= hi_h and (want is None or abs(h - want) < 0.03)
    rep.add("massstab", "PASS" if ok else "FAIL", f"Höhe {h:.3f} m" + (f" (Manifest {want} m)" if want else ""))
    rep.add("massstab", "PASS" if abs(lo.z) <= LIMITS["ground_m"] else "FAIL", f"tiefster Punkt Z = {lo.z:+.3f} m")
    c = (lo + hi) / 2
    off = math.hypot(c.x, c.y)
    rep.add("massstab", "PASS" if off <= LIMITS["pivot_m"] else "WARN", f"Mitte der Bounding Box {off:.3f} m vom Pivot")


def check_skin(rep, meshes):
    for m in meshes:
        groups = {g.index: g.name for g in m.vertex_groups}
        bones = {g for g in groups.values() if g.startswith(P)}
        over, unweighted, badsum = 0, 0, 0
        for v in m.data.vertices:
            ws = [g.weight for g in v.groups if groups.get(g.group) in bones and g.weight > 1e-4]
            if not ws:
                unweighted += 1
                continue
            over += len(ws) > 4
            badsum += abs(sum(ws) - 1) > 0.01
        lvl = "FAIL" if unweighted else ("WARN" if over or badsum else "PASS")
        rep.add("skin", lvl, f"{m.name}: {len(m.data.vertices)} Vertices, {unweighted} ohne Gewicht, "
                             f"{over} mit >4 Einflüssen, {badsum} mit Gewichtssumme ≠ 1")


def check_clips(rep, arm, manifest):
    info = {a["name"]: a for a in (manifest or {}).get("animations", [])}
    actions = [a for a in bpy.data.actions if a.name in info] if info else list(bpy.data.actions)
    arm_len = ((rest_joint(arm, "LeftForeArm") - rest_joint(arm, "LeftArm")).length +
               (rest_joint(arm, "LeftHand") - rest_joint(arm, "LeftForeArm")).length)
    for act in actions:
        meta = info.get(act.name, {})
        arm.animation_data.action = act
        worst_fwd, worst_mid, worst_twist, worst_knee = (-9, ""), (-9, ""), (0, ""), (-9, "")
        hips = []
        for f in sample_frames(act):
            set_frame(f)
            right, fwd, _ = body_frame(arm)
            hips.append(joint(arm, "Hips"))
            center = (joint(arm, "LeftUpLeg") + joint(arm, "RightUpLeg")) / 2
            for side, sign in (("Left", -1), ("Right", 1)):
                hand, shoulder = joint(arm, side + "Hand"), joint(arm, side + "Arm")
                fwd_rel = (hand - shoulder).dot(fwd) / arm_len
                worst_fwd = max(worst_fwd, (fwd_rel, f"{side}Hand Frame {f}"))
                across = -sign * (hand - center).dot(right)  # >0: Hand auf der falschen Seite
                worst_mid = max(worst_mid, (across, f"{side}Hand Frame {f}"))
                for child, parent, a, b in ((side + "ForeArm", side + "Arm", side + "ForeArm", side + "Hand"),
                                            (side + "Hand", side + "ForeArm", side + "ForeArm", side + "Hand")):
                    t = twist_deg(arm, child, parent, a, b)
                    worst_twist = max(worst_twist, (t, f"{child} Frame {f}"))
                hip, knee, ankle = joint(arm, side + "UpLeg"), joint(arm, side + "Leg"), joint(arm, side + "Foot")
                line = ankle - hip
                closest = hip + line * ((knee - hip).dot(line) / max(line.length_squared, 1e-9))
                back = -(knee - closest).dot(fwd)  # >0: Knie hinter der Linie
                bend = math.degrees((knee - hip).angle(ankle - knee, 0))
                if bend > 5:
                    worst_knee = max(worst_knee, (back, f"{side}Leg Frame {f}"))

        if meta.get("arms") == "relaxed":
            v, where = worst_fwd
            rep.add("arme", "PASS" if v <= LIMITS["relaxed_hand_forward"] else "FAIL",
                    f"Hand max. {v:.2f} Armlängen vor der Schulter ({where}), erlaubt {LIMITS['relaxed_hand_forward']}",
                    act.name)
        if meta.get("arms") in ("relaxed", "swing"):
            v, where = worst_mid
            rep.add("arme", "PASS" if v <= LIMITS["relaxed_hand_midline"] else "FAIL",
                    (f"Hand {v:.3f} m über die Körpermitte gekreuzt ({where})" if v > 0 else
                     f"Hände bleiben mind. {-v:.3f} m auf ihrer Seite ({where})"), act.name)
        v, where = worst_twist
        lvl = "FAIL" if v > LIMITS["twist_fail_deg"] else "WARN" if v > LIMITS["twist_warn_deg"] else "PASS"
        rep.add("verdrehung", lvl, f"max. {v:.0f}° Twist ({where})", act.name)
        v, where = worst_knee
        if where:
            rep.add("knie", "PASS" if v <= LIMITS["knee_back_m"] else "FAIL",
                    (f"Knie {v:.3f} m hinter der Linie Hüfte-Knöchel ({where})" if v > 0 else
                     f"Knie mind. {-v:.3f} m vor der Linie Hüfte-Knöchel ({where})"), act.name)
        travel = max(math.hypot(h.x - hips[0].x, h.y - hips[0].y) for h in hips)
        if meta.get("in_place"):
            rep.add("root_motion", "PASS" if travel <= LIMITS["in_place_m"] else "FAIL",
                    f"in place, Hüfte wandert max. {travel:.2f} m", act.name)
        elif "root_motion_m" in meta:
            ok = abs(travel - meta["root_motion_m"]) < 0.2
            rep.add("root_motion", "PASS" if ok else "WARN",
                    f"Hüfte wandert {travel:.2f} m (Manifest {meta['root_motion_m']} m)", act.name)
    arm.animation_data.action = None


def check_source(rep, arm, manifest, anim_dir):
    files = os.listdir(anim_dir)
    for meta in manifest.get("animations", []):
        src_file = meta.get("source_file")
        act = bpy.data.actions.get(meta["name"])
        if not src_file or src_file not in files or not act:
            rep.add("quelle", "WARN", "keine Quelldatei im Manifest (source_file) oder nicht gefunden", meta["name"])
            continue
        before = set(bpy.data.objects)
        acts_before = set(bpy.data.actions)
        bpy.ops.import_scene.fbx(filepath=os.path.join(anim_dir, src_file))
        new = [o for o in bpy.data.objects if o not in before]
        src = next(o for o in new if o.type == "ARMATURE")
        arm.animation_data.action = act
        worst = (0.0, "")
        for f in sample_frames(src.animation_data.action):
            set_frame(f)
            for a, b in CHAINS:
                ds = joint(src, b) - joint(src, a)
                dt = joint(arm, b) - joint(arm, a)
                if ds.length < 1e-6 or dt.length < 1e-6:
                    continue
                worst = max(worst, (math.degrees(ds.angle(dt)), f"{a}→{b} Frame {f}"))
        v, where = worst
        lvl = "FAIL" if v > LIMITS["source_fail_deg"] else "WARN" if v > LIMITS["source_warn_deg"] else "PASS"
        rep.add("quelle", lvl, f"Gelenkrichtungen weichen max. {v:.1f}° von Mixamo ab ({where})", meta["name"])
        for o in new:
            bpy.data.objects.remove(o)
        for a in set(bpy.data.actions) - acts_before:
            bpy.data.actions.remove(a)
    arm.animation_data.action = None


def main():
    opts = parse_args()
    manifest = json.load(open(opts["manifest"], encoding="utf-8")) if opts["manifest"] else None
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if manifest and manifest.get("animations"):
        bpy.context.scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=opts["glb"])
    arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    rep = Report()
    if len(arms) != 1:
        rep.add("struktur", "FAIL", f"{len(arms)} Armatures statt 1")
    elif check_structure(rep, arms[0], meshes, manifest):
        arm = arms[0]
        arm.animation_data_create()
        skinned = [m for m in meshes if any(md.type == "ARMATURE" for md in m.modifiers)]
        check_scale(rep, arm, skinned, manifest)
        check_skin(rep, skinned)
        check_clips(rep, arm, manifest)
        if opts["anims"] and manifest:
            check_source(rep, arm, manifest, opts["anims"])
    print(f"\nFigurencheck: {opts['glb']}\n")
    rep.print()
    if opts["json"]:
        with open(opts["json"], "w", encoding="utf-8") as fh:
            json.dump({"file": opts["glb"], "results": rep.rows}, fh, ensure_ascii=False, indent=2)
    sys.exit(1 if rep.failed() else 0)


if __name__ == "__main__":
    main()
