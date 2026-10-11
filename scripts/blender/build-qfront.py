# Cityscape C2 (docs/PLAN-CITYSCAPE.md): QFRONT's built detail, as a GLB.
#
#   node scripts/qfront-spec.mjs <spec.json>
#   blender -b -P scripts/blender/build-qfront.py -- <spec.json> <out.glb>
#
# The scene keeps QFRONT's surveyed masses, its screen and its deep glass (src/heroes). What a
# box extrusion cannot give it is built here, on the same footprint:
#   QFRONT_CROWN_LOUVRES   the roof screen of vertical louvres round the crown
#   QFRONT_LOGO            "QFRONT" in extruded letters on the upper storeys, facing the crossing
#   QFRONT_FINS            deep aluminium fins at the corners of the glass block
#   QFRONT_SLABS           slab ledges proud of the glass, floor by floor (not across the screen)
#   QFRONT_CANOPY          the podium canopy over the entrance, with its downlight strip
#   QFRONT_ROOF_PLANT      plant on the roof
# Ambient occlusion is baked into a colour attribute (Cycles, CPU), so the asset needs no texture.
# Coordinates: the spec is scene metres (X east, Y up, Z south); Blender is Z-up, so a scene point
# (x, y, z) is Blender (x, -z, y), and the glTF exporter's +Y up turns it back. Applied once.
import bpy, bmesh, json, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
spec = json.load(open(argv[0]))
out = argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def B(x, y, z):
    return Vector((x, -z, y))

def inside(p, ring):
    x, z = p; c = False
    for i in range(len(ring)):
        (x1, z1), (x2, z2) = ring[i], ring[(i + 1) % len(ring)]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            c = not c
    return c

def edges(ring):
    """Each edge with its outward normal (tested against the polygon, not assumed from winding)."""
    out = []
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz)
        if L < .3: continue
        t = (dx / L, dz / L); n = (t[1], -t[0])
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        if inside((mid[0] + n[0] * .2, mid[1] + n[1] * .2), ring): n = (-n[0], -n[1])
        out.append(dict(a=a, b=b, t=t, n=n, L=L, mid=mid))
    return out

def box(bm, centre, size, yaw):
    """A box at scene `centre` (x, y, z), `size` (along, up, out), turned `yaw` about up."""
    verts = bmesh.ops.create_cube(bm, size=1.0)['verts']
    for v in verts:   # local X along, Y out, Z up (Blender frame)
        v.co = Vector((v.co.x * size[0], v.co.y * size[2], v.co.z * size[1]))
    bmesh.ops.rotate(bm, verts=verts, cent=Vector((0, 0, 0)), matrix=Matrix.Rotation(yaw, 3, 'Z'))
    bmesh.ops.translate(bm, verts=verts, vec=B(*centre))

def edge_yaw(e):
    # Blender Z rotation that takes local +X onto the edge tangent (scene t -> Blender (t.x, -t.z)).
    return math.atan2(-e['t'][1], e['t'][0])

def material(name, colour, rough=.5, metal=0., emit=None, strength=0.):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*colour, 1)
    p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1); p.inputs['Emission Strength'].default_value = strength
    return m

MAT = dict(frame=material('qf_frame', (.16, .18, .2), .35, .85),
           louvre=material('qf_louvre', (.42, .45, .47), .45, .7),
           logo=material('qf_logo', (.95, .95, .95), .3, 0, (1, 1, 1), 1.0),
           light=material('qf_light', (1, .9, .75), .5, 0, (1, .82, .6), 1.0),
           plant=material('qf_plant', (.5, .52, .5), .7, .3))

def mesh_object(name, build, mat):
    bm = bmesh.new(); build(bm)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    me.materials.append(MAT[mat]); return ob

masses = {m['label']: m for m in spec['masses']}
base, media, upper, crown = (masses[k] for k in ('commercial-base', 'media-block', 'upper-storeys', 'roof-crown'))
pdir = spec['primary']['direction']
facing = lambda e: e['n'][0] * pdir[0] + e['n'][1] * pdir[1]

def crown_louvres(bm):
    ring = crown['polygon']; top = crown['top']
    for e in edges(ring):
        count = max(2, int(e['L'] / .55))
        for i in range(count + 1):
            u = e['L'] * i / count
            x = e['a'][0] + e['t'][0] * u + e['n'][0] * .12
            z = e['a'][1] + e['t'][1] * u + e['n'][1] * .12
            box(bm, (x, top + .7, z), (.06, 1.4, .28), edge_yaw(e))
        # top and bottom rails
        for y in (top + .05, top + 1.38):
            box(bm, (e['mid'][0] + e['n'][0] * .12, y, e['mid'][1] + e['n'][1] * .12), (e['L'], .08, .3), edge_yaw(e))

def fins(bm):
    ring = media['polygon']
    lo, hi = media['bottom'], upper['top']
    for i, p in enumerate(ring):
        # the bisector of the two edge normals at this corner
        es = edges(ring)
        prev = [e for e in es if e['b'] == p]; nxt = [e for e in es if e['a'] == p]
        if not prev or not nxt: continue
        n = (prev[0]['n'][0] + nxt[0]['n'][0], prev[0]['n'][1] + nxt[0]['n'][1]); L = math.hypot(*n) or 1
        n = (n[0] / L, n[1] / L)
        box(bm, (p[0] + n[0] * .22, (lo + hi) / 2, p[1] + n[1] * .22), (.5, hi - lo, .12), math.atan2(-n[1], n[0]))

def slabs(bm):
    sb, sh = spec['screen']['bottom'], spec['screen']['height']
    for y in [8.2 + 5.4 * k for k in range(6)] + [38.65]:
        for e in edges(media['polygon']):
            if facing(e) > .85 and sb + .15 - 1 < y < sb + .15 + sh + 1: continue
            box(bm, (e['mid'][0] + e['n'][0] * .16, y, e['mid'][1] + e['n'][1] * .16), (e['L'] + .1, .3, .34), edge_yaw(e))

def canopy(bm):
    for e in edges(base['polygon']):
        if facing(e) < .5: continue
        box(bm, (e['mid'][0] + e['n'][0] * .7, 7.35, e['mid'][1] + e['n'][1] * .7), (e['L'] + .2, .32, 1.4), edge_yaw(e))

def canopy_light(bm):
    for e in edges(base['polygon']):
        if facing(e) < .5: continue
        box(bm, (e['mid'][0] + e['n'][0] * 1.2, 7.17, e['mid'][1] + e['n'][1] * 1.2), (e['L'] - .4, .04, .18), edge_yaw(e))

def roof_plant(bm):
    ring = crown['polygon']; cx = sum(p[0] for p in ring) / len(ring); cz = sum(p[1] for p in ring) / len(ring)
    top = crown['top']
    for dx, dz, w, h, d in ((-4, -2, 5, 2.2, 3), (3, 1, 4, 1.6, 4), (0, 4, 2.5, 3.2, 2.5)):
        if inside((cx + dx, cz + dz), ring): box(bm, (cx + dx, top + h / 2, cz + dz), (w, h, d), 0)

mesh_object('QFRONT_CROWN_LOUVRES', crown_louvres, 'louvre')
mesh_object('QFRONT_FINS', fins, 'frame')
mesh_object('QFRONT_SLABS', slabs, 'frame')
mesh_object('QFRONT_CANOPY', canopy, 'frame')
mesh_object('QFRONT_CANOPY_LIGHT', canopy_light, 'light')
mesh_object('QFRONT_ROOF_PLANT', roof_plant, 'louvre')

# The lettering: across the curved front that faces the crossing, on the upper storeys -- flat,
# square to the crossing, just proud of the curve's furthest point.
ring = upper['polygon']
reach = max(p[0] * pdir[0] + p[1] * pdir[1] for p in ring)
fr = [e for e in edges(ring) if facing(e) > .85]
mid = [sum(e['mid'][0] for e in fr) / len(fr), sum(e['mid'][1] for e in fr) / len(fr)]
along = mid[0] * pdir[0] + mid[1] * pdir[1]
mid = [mid[0] + pdir[0] * (reach - along + .35), mid[1] + pdir[1] * (reach - along + .35)]
cu = bpy.data.curves.new('QFRONT_LOGO', 'FONT'); cu.body = 'QFRONT'
cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = .09; cu.size = 1.9; cu.space_character = 1.12
logo = bpy.data.objects.new('QFRONT_LOGO', cu); scene.collection.objects.link(logo)
bpy.context.view_layer.objects.active = logo; logo.select_set(True)
bpy.ops.object.convert(target='MESH')
logo = bpy.context.view_layer.objects.active; logo.name = 'QFRONT_LOGO'
# Text lies in Blender XY facing +Z: stand it up (face -Y), then turn it to face the crossing.
logo.rotation_euler = (math.pi / 2, 0, math.atan2(-pdir[1], pdir[0]) + math.pi / 2)
logo.location = B(mid[0], (upper['bottom'] + upper['top']) / 2, mid[1])
logo.data.materials.clear(); logo.data.materials.append(MAT['logo'])

# One mesh per material, so the asset costs four draw calls, not seven.
def join(names, into):
    obs = [bpy.data.objects[n] for n in names]
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]; bpy.ops.object.join(); obs[0].name = into
join(['QFRONT_FINS', 'QFRONT_SLABS', 'QFRONT_CANOPY'], 'QFRONT_FRAME')
join(['QFRONT_CROWN_LOUVRES', 'QFRONT_ROOF_PLANT'], 'QFRONT_CROWN')

# Apply transforms so the GLB carries world-placed geometry under one root.
for ob in list(scene.objects):
    ob.select_set(True)
bpy.context.view_layer.objects.active = scene.objects[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Ambient occlusion into a colour attribute, per object (Cycles CPU).
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 32
for ob in [o for o in scene.objects if o.type == 'MESH']:
    me = ob.data
    if not me.color_attributes: me.color_attributes.new('AO', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = me.color_attributes[0]
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')

root = bpy.data.objects.new('QFRONT_ROOT', None); scene.collection.objects.link(root)
for ob in scene.objects:
    if ob is not root: ob.parent = root

bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_apply=True,
                          export_attributes=True, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                          export_materials='EXPORT', export_cameras=False, export_lights=False)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in scene.objects if o.type == 'MESH')
print(f'QFRONT asset: {len([o for o in scene.objects if o.type == "MESH"])} meshes, {tris} triangles -> {out}')
