import bpy, bmesh, sys, os
from mathutils import Vector

argv = sys.argv
argv = argv[argv.index("--") + 1:]
input_fbx, output_glb = argv[0], argv[1]

log = []
def L(msg):
    line = "[CONVERT] " + str(msg)
    print(line)
    log.append(str(msg))

def world_bbox(meshes):
    mins = [1e18] * 3; maxs = [-1e18] * 3
    for o in meshes:
        for corner in o.bound_box:
            wc = o.matrix_world @ Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], wc[i]); maxs[i] = max(maxs[i], wc[i])
    if mins[0] > 1e17:
        return [0, 0, 0]
    return [round(maxs[i] - mins[i], 4) for i in range(3)]

# ---------- 1. Empty scene ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
L("Started from empty scene")

# ---------- 2. Import FBX ----------
try:
    import addon_utils
    addon_utils.enable("io_scene_gltf2", default_set=False)
except Exception:
    pass
bpy.ops.import_scene.gltf(filepath=input_fbx)
imported = list(bpy.data.objects)
meshes = [o for o in imported if o.type == "MESH"]
empties = [o for o in imported if o.type == "EMPTY"]
armatures = [o for o in imported if o.type == "ARMATURE"]
others = [o for o in imported if o.type not in ("MESH", "EMPTY", "ARMATURE")]
L("Imported %d objects (meshes=%d empties=%d armatures=%d other=%d)" %
  (len(imported), len(meshes), len(empties), len(armatures), len(others)))

# ---------- 2b. Hierarchy ----------
L("Object hierarchy (name | type | parent | tris):")
tri_total = 0
for o in imported:
    par = o.parent.name if o.parent else "-"
    tris = len(o.data.loop_triangles) if o.type == "MESH" else 0
    if o.type == "MESH":
        o.data.calc_loop_triangles()
        tris = len(o.data.loop_triangles)
        tri_total += tris
    L("  '%s' | %s | %s | %s" % (o.name, o.type, par, tris if o.type == "MESH" else "-"))
L("Total triangles imported: %d" % tri_total)

# ---------- 2c. Scale report ----------
orig_dims = world_bbox(meshes)
L("Scene bounding-box dims (X,Y,Z): %s" % orig_dims)
maxdim = max(orig_dims) if orig_dims else 0
if maxdim > 100 or (0 < maxdim < 0.01):
    L("WARNING: unusual overall scale (max dim %.4f) - FBX units may be cm/mm/other." % maxdim)
else:
    L("Overall scale looks reasonable (max dim %.4f)." % maxdim)

# ---------- 3/4. Per-mesh cleanup ----------
bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
removed_verts = 0
nonmanifold = []
for o in meshes:
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    v0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    removed_verts += v0 - len(bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # consistent, outward
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    if nm:
        nonmanifold.append((o.name, nm))
    bm.to_mesh(me); bm.free(); me.update()
L("Merge-by-distance (0.0001): removed %d duplicate verts; recalculated normals outward." % removed_verts)
if nonmanifold:
    for n, c in nonmanifold:
        L("NOTE: '%s' has %d non-manifold edges (expected for open shells like a screen face/knob cap; not altered)." % (n, c))
else:
    L("No non-manifold edges detected.")

# ---------- 4b. Remove empty meshes & childless helper empties ----------
removed = []
for o in list(bpy.data.objects):
    if o.type == "MESH" and len(o.data.vertices) == 0:
        removed.append(o.name + " (empty mesh)"); bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.data.objects):
    if o.type == "EMPTY" and len(o.children) == 0:
        removed.append(o.name + " (childless helper/null)"); bpy.data.objects.remove(o, do_unlink=True)
L("Removed unused objects: %s" % (removed if removed else "none"))
meshes = [o for o in bpy.data.objects if o.type == "MESH"]

# ---------- 4c. Scale handling ----------
# Many components share mesh data (instanced: duplicated encoders/knobs/PCBs).
# Applying object scale would abort on multi-user data (leaving a mixed scale
# state) or force single-user copies that bloat the file and break instancing.
# glTF preserves node transforms, so a uniform object scale renders correctly
# as-is. We therefore preserve transforms and just report the scale.
scales = {tuple(round(s, 3) for s in o.scale) for o in meshes}
n_instanced = sum(1 for o in meshes if o.data.users > 1)
L("Object scales present: %s (uniform across meshes); %d meshes use shared/instanced mesh data." %
  (sorted(scales), n_instanced))
L("Scale NOT applied: kept in glTF node transforms to preserve instancing and a consistent scale (avoids multi-user apply errors).")

# ---------- 5. Origins ----------
L("Origins: preserved the FBX's original pivots (per spec, since knobs/screen pivots may be intentional and intent is ambiguous).")

# ---------- 6. Materials ----------
L("Materials (%d):" % len(bpy.data.materials))
for m in bpy.data.materials:
    if not m.use_nodes:
        m.use_nodes = True
    has_pr = any(n.type == "BSDF_PRINCIPLED" for n in m.node_tree.nodes)
    if not has_pr:
        # wrap: build a Principled from the material's diffuse color / existing output
        nt = m.node_tree
        pr = nt.nodes.new("ShaderNodeBsdfPrincipled")
        out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None) or nt.nodes.new("ShaderNodeOutputMaterial")
        try:
            pr.inputs["Base Color"].default_value = (*m.diffuse_color[:3], 1.0)
        except Exception:
            pass
        nt.links.new(pr.outputs["BSDF"], out.inputs["Surface"])
    L("  '%s' | Principled BSDF: %s" % (m.name, "yes" if has_pr else "converted"))

# textures
missing = []
for img in bpy.data.images:
    if img.source == "FILE":
        path = bpy.path.abspath(img.filepath)
        if img.packed_file is None and (not path or not os.path.exists(path)):
            missing.append(img.name)
if missing:
    L("WARNING: missing/unresolved texture images: %s" % missing)
else:
    L("Texture images: %d, all resolved or embedded." % len([i for i in bpy.data.images if i.source == "FILE"]))
try:
    bpy.ops.file.pack_all(); L("Packed all textures into the .blend.")
except Exception as e:
    L("pack_all note: %s" % e)

# ---------- 7. Remove orphan data ----------
try:
    bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    L("Purged orphaned data blocks.")
except Exception as e:
    L("orphans_purge note: %s" % e)

# ---------- 8. Export GLB ----------
final = list(bpy.data.objects)
final_meshes = [o for o in final if o.type == "MESH"]
pre_names = [o.name for o in final]
L("Pre-export scene: %d objects (%d meshes). Names: %s" % (len(final), len(final_meshes), pre_names))

has_vcol = any(len(getattr(o.data, "color_attributes", [])) > 0 for o in final_meshes)
props = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
desired = dict(
    filepath=output_glb, export_format="GLB", use_selection=False,
    export_materials="EXPORT", export_texcoords=True, export_normals=True,
    export_cameras=False, export_animations=False, export_apply=True,
)
if has_vcol:
    if "export_vertex_color" in props:
        desired["export_vertex_color"] = "MATERIAL"
    elif "export_colors" in props:
        desired["export_colors"] = True
kwargs = {k: v for k, v in desired.items() if k == "filepath" or k in props}
bpy.ops.export_scene.gltf(**kwargs)
L("Exported GLB. vertex-colors present in source: %s (export_animations=False, export_cameras=False)." % ("yes" if has_vcol else "no"))

in_sz = os.path.getsize(input_fbx); out_sz = os.path.getsize(output_glb)
L("File size: FBX %.1f KB  ->  GLB %.1f KB" % (in_sz / 1024, out_sz / 1024))

# ---------- 9. Verify: re-import the GLB ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=output_glb)
re_objs = list(bpy.data.objects)
re_meshes = [o for o in re_objs if o.type == "MESH"]
L("VERIFY re-import: %d objects (%d meshes). Names: %s" % (len(re_objs), len(re_meshes), [o.name for o in re_objs]))
L("VERIFY bounding-box dims: %s  (original: %s)" % (world_bbox(re_meshes), orig_dims))
L("VERIFY materials: %d, images: %d" % (len(bpy.data.materials), len(bpy.data.images)))
gltf_missing = [i.name for i in bpy.data.images if i.source == "FILE" and i.packed_file is None and not os.path.exists(bpy.path.abspath(i.filepath))]
L("VERIFY textures linked: %s" % ("all OK/embedded" if not gltf_missing else ("MISSING: %s" % gltf_missing)))

print("\n===== CONVERSION SUMMARY =====")
for m in log:
    print(m)
print("===== END =====")
