# Look 2 (docs/GTA-LOOK.md): build the crowd's citizens from MakeHuman CC0 assets.
#
#   blender -b --python scripts/blender/build-citizens.py -- <spec.json> <outDir> [id,...]
#
# Needs Blender 4.2 with the MPFB 2 extension and the MakeHuman system assets pack (CC0) loaded
# into it (see docs/GTA-LOOK.md). MPFB is a GPL tool; what it outputs from CC0 assets is ours.
#
# For each citizen in the spec:
#  1. MPFB makes a human from macros (gender, age, weight, muscle, height, proportions, race), with
#     a skin, clothes, shoes, hair, eyebrows, eyelashes and eyes, rigged with its game_engine rig.
#  2. That rig is posed so every joint lands on the matching joint of the crowd's Quaternius
#     skeleton (public/data/character/citizen.glb, male rig) -- each bone stretched from its own
#     joint to its chain child's -- and the pose is baked into the meshes. The meshes are then
#     skinned to the Quaternius armature with MPFB's own weights (the bone names are the same, UE
#     style), so every existing clip and the crowd's bone atlas drive them unchanged.
#     Build -- thin, heavy, old, young -- stays in the mesh; height is the crowd's per-person scale.
#  3. The diffuse textures are packed into one atlas (clothes multiplied by their AO map), the
#     UVs moved into each part's tile, and every vertex gets a region: 0 skin, 1 top, 2 bottom,
#     3 hair, 4 shoe, 5 keep (eyes, brows, lashes) -- the crowd tints regions 0-4 per person.
#  4. One skinned mesh + the armature go to <outDir>/<id>.glb, the atlas to <outDir>/<id>.png.
import bpy,sys,os,json,math
import numpy as np
from mathutils import Vector,Matrix
args=sys.argv[sys.argv.index('--')+1:]
spec=json.load(open(args[0]));out=args[1];only=set(args[2].split(','))if len(args)>2 else None
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.locationservice import LocationService
DATA=LocationService.get_user_data('')
CITIZEN=spec.get('skeleton','public/data/character/citizen.glb')
ATLAS=spec.get('atlas',1024)
os.makedirs(out,exist_ok=True)

CHILD={'pelvis':'spine_01','spine_01':'spine_02','spine_02':'spine_03','spine_03':'neck_01','neck_01':'Head',
 'clavicle_l':'upperarm_l','upperarm_l':'lowerarm_l','lowerarm_l':'hand_l','hand_l':'middle_01_l',
 'clavicle_r':'upperarm_r','upperarm_r':'lowerarm_r','lowerarm_r':'hand_r','hand_r':'middle_01_r',
 'thigh_l':'calf_l','calf_l':'foot_l','foot_l':'ball_l','ball_l':'ball_leaf_l',
 'thigh_r':'calf_r','calf_r':'foot_r','foot_r':'ball_r','ball_r':'ball_leaf_r'}
for f in ['index','middle','pinky','ring','thumb']:
 for side in 'lr':
  for k in (1,2):CHILD[f'{f}_0{k}_{side}']=f'{f}_0{k+1}_{side}'
  CHILD[f'{f}_03_{side}']=f'{f}_04_leaf_{side}'
LEGS={'thigh_l','calf_l','foot_l','ball_l','thigh_r','calf_r','foot_r','ball_r'}
# Atlas tiles (x, y, size) in atlas units, y up as Blender's UVs are.
TILES={'body':(0,.5,.5),'top':(.5,.5,.5),'outfit2':(0,0,.5),'shoes':(.5,.25,.25),'hair':(.75,.25,.25),
 'eyes':(.5,0,.125),'eyebrows':(.625,0,.125),'eyelashes':(.75,0,.125)}

def asset(kind,name):return os.path.join(DATA,kind,name,name+'.mhclo')
def first(kind):d=os.path.join(DATA,kind);n=sorted(x for x in os.listdir(d) if os.path.isdir(os.path.join(d,x)) and os.path.exists(os.path.join(d,x,x+'.mhclo')))[0];return asset(kind,n)

def clear():
 for o in list(bpy.data.objects):bpy.data.objects.remove(o)
 for c in (bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.images,bpy.data.actions):
  for x in list(c):c.remove(x)

def skeleton():
 bpy.ops.import_scene.gltf(filepath=CITIZEN)
 Q=bpy.data.objects['Armature']
 for o in list(bpy.data.objects):
  if o is not Q:bpy.data.objects.remove(o)
 for a in list(bpy.data.actions):bpy.data.actions.remove(a)
 Q.animation_data_clear();Q.data.pose_position='REST'
 return Q

def human(c):
 m=c['macro'];macro={'gender':m['gender'],'age':m['age'],'muscle':m.get('muscle',.5),'weight':m.get('weight',.5),
  'height':m.get('height',.6),'proportions':m.get('proportions',.5),'cupsize':m.get('cupsize',.5),'firmness':m.get('firmness',.5),
  'race':m.get('race',{'african':0.,'asian':1.,'caucasian':0.})}
 b=HumanService.create_human(macro_detail_dict=macro)
 rig=HumanService.add_builtin_rig(b,'game_engine')
 HumanService.set_character_skin(os.path.join(DATA,'skins',c['skin'],c['skin']+'.mhmat'),b,skin_type='MAKESKIN')
 roles={}
 for i,name in enumerate(c['outfit']):
  o=HumanService.add_mhclo_asset(asset('clothes',name),b,asset_type='Clothes',subdiv_levels=0,material_type='MAKESKIN');roles[name]='top' if i==0 else 'outfit2'
 HumanService.add_mhclo_asset(asset('clothes',c['shoes']),b,asset_type='Clothes',subdiv_levels=0,material_type='MAKESKIN');roles[c['shoes']]='shoes'
 if c.get('hair'):HumanService.add_mhclo_asset(asset('hair',c['hair']),b,asset_type='Hair',subdiv_levels=0,material_type='MAKESKIN');roles[c['hair']]='hair'
 HumanService.add_mhclo_asset(first('eyebrows'),b,asset_type='Eyebrows',subdiv_levels=0,material_type='MAKESKIN')
 HumanService.add_mhclo_asset(first('eyelashes'),b,asset_type='Eyelashes',subdiv_levels=0,material_type='MAKESKIN')
 eyes=os.path.join(DATA,'eyes','low-poly');eyes=os.path.join(eyes,[x for x in os.listdir(eyes) if x.endswith('.mhclo')][0])
 HumanService.add_mhclo_asset(eyes,b,asset_type='Eyes',subdiv_levels=0,material_type='MAKESKIN')
 return b,rig,roles

def fit(Q,rig):
 mpfb={b.name.lower():b.name for b in rig.data.bones}
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 for name,child in CHILD.items():
  a=rig.data.edit_bones.get(mpfb.get(name.lower(),'?'));c=rig.data.edit_bones.get(mpfb.get(child.lower(),'?'))
  if a and c and (c.head-a.head).length>1e-4:a.tail=c.head.copy()
 bpy.ops.object.mode_set(mode='OBJECT')
 qn={bn.name.lower():bn.name for bn in Q.data.bones}
 for pb in rig.pose.bones:
  q=qn.get(pb.name.lower())
  if not q:continue
  k=pb.constraints.new('COPY_LOCATION');k.target=Q;k.subtarget=q
  ch=CHILD.get(q)
  if ch and ch in Q.data.bones:
   s=pb.constraints.new('STRETCH_TO');s.target=Q;s.subtarget=ch;s.volume='NO_VOLUME';s.rest_length=pb.bone.length
  elif pb.name!='Root':
   e=bpy.data.objects.new('aim_'+pb.name,None);bpy.context.scene.collection.objects.link(e)
   e.location=pb.bone.tail_local-pb.bone.head_local+Q.data.bones[q].head_local
   s=pb.constraints.new('STRETCH_TO');s.target=e;s.volume='NO_VOLUME';s.rest_length=pb.bone.length
 bpy.context.view_layer.update()

def pose_natural(Q,rig):
 """Look 2b: pose MPFB's rig into the crowd skeleton's T-pose by ROTATION only -- every bone
 turned so it points the way the matching Quaternius bone points, at its own length. The
 person keeps their own proportions (a woman's shoulders, a heavy man's reach); only the stance
 is the skeleton's, so its clips can be handed over as rotations."""
 mpfb={b.name.lower():b.name for b in rig.data.bones}
 qn={bn.name.lower():bn.name for bn in Q.data.bones}
 bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
 for name,child in CHILD.items():
  a=rig.data.edit_bones.get(mpfb.get(name.lower(),'?'));c=rig.data.edit_bones.get(mpfb.get(child.lower(),'?'))
  if a and c and (c.head-a.head).length>1e-4:a.tail=c.head.copy()
 bpy.ops.object.mode_set(mode='OBJECT')
 bpy.ops.object.mode_set(mode='POSE')
 def walk(b):
  yield b
  for c in b.children:yield from walk(c)
 roots=[b for b in rig.pose.bones if b.parent is None]
 QW=Q.matrix_world
 for root in roots:
  for pb in walk(root):
   q=qn.get(pb.name.lower());ch=CHILD.get(q) if q else None
   if not ch or ch not in Q.data.bones:continue
   want=(QW@Q.data.bones[ch].head_local-QW@Q.data.bones[q].head_local).normalized()
   bpy.context.view_layer.update()
   m=rig.matrix_world@pb.matrix;head=m.to_translation();have=(m.to_3x3()@Vector((0,1,0))).normalized()
   R=have.rotation_difference(want).to_matrix().to_4x4()
   T=Matrix.Translation(head)
   pb.matrix=rig.matrix_world.inverted()@T@R@Matrix.Translation(-head)@m
 bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()

def natural_armature(Q,rig,name):
 """The citizen's own skeleton: the crowd skeleton's bones, names and orientations, with every
 joint moved to where this person's joint is in the pose above. Same rest orientations means
 the crowd's clips apply as they are, rotation for rotation."""
 A=Q.copy();A.data=Q.data.copy();A.name=name+'-rig';bpy.context.scene.collection.objects.link(A)
 heads={}
 for pb in rig.pose.bones:heads[pb.name.lower()]=(rig.matrix_world@pb.matrix).to_translation()
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=A;A.select_set(True)
 bpy.ops.object.mode_set(mode='EDIT')
 inv=A.matrix_world.inverted();Qb=Q.data.bones
 def walk(b):
  yield b
  for c in b.children:yield from walk(c)
 shift={}
 for root in [b for b in A.data.edit_bones if b.parent is None]:
  for eb in walk(root):
   q=Qb[eb.name];vec=eb.tail-eb.head
   h=heads.get(eb.name.lower())
   if h is not None:new=inv@h
   else:
    p=eb.parent;new=q.head_local+(shift.get(p.name,Vector((0,0,0))) if p else Vector((0,0,0)))
   shift[eb.name]=new-q.head_local
   roll=eb.roll;eb.head=new;eb.tail=new+vec;eb.roll=roll
 bpy.ops.object.mode_set(mode='OBJECT')
 return A

def role_of(o,roles):
 n=o.name.lower()
 if n=='human':return 'body'
 for k,r in roles.items():
  if k.lower() in n:return r
 if 'eyebrow' in n:return 'eyebrows'
 if 'eyelash' in n:return 'eyelashes'
 if 'eye' in n or 'low-poly' in n or 'high-poly' in n:return 'eyes'
 return None

def image_of(mat,slot='diffuseTexture'):
 n=mat.node_tree.nodes.get(slot) if mat and mat.node_tree else None
 return n.image if n and n.image else None

def pixels(img,size):
 im=img.copy();im.scale(size,size)
 a=np.array(im.pixels[:],dtype=np.float32).reshape(size,size,4);bpy.data.images.remove(im);return a

def build(c,Q):
 b,rig,roles=human(c)
 natural=spec.get('fit','natural')=='natural'
 if natural:pose_natural(Q,rig)
 else:fit(Q,rig)
 dg=bpy.context.evaluated_depsgraph_get()
 atlas=np.zeros((ATLAS,ATLAS,4),dtype=np.float32)
 parts=[]
 for o in [o for o in bpy.data.objects if o.type=='MESH' and (o.parent is rig or (o.parent and o.parent.parent is rig) or o is b)]:
  role=role_of(o,roles)
  if role is None:print('SKIP',o.name);continue
  me=bpy.data.meshes.new_from_object(o.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
  me.transform(o.matrix_world)
  n=bpy.data.objects.new(o.name+'.fit',me);bpy.context.scene.collection.objects.link(n)
  for vg in o.vertex_groups:
   if vg.name not in n.vertex_groups:n.vertex_groups.new(name=vg.name)
  # The atlas tile: the part's diffuse, times its AO map (the folds) where it has one.
  x,y,s=TILES[role];px=int(s*ATLAS)
  mat=o.material_slots[0].material if o.material_slots else None
  img=image_of(mat)
  if img:
   tile=pixels(img,px);ao=image_of(mat,'aomapTexture')
   if ao is not None:tile[...,:3]*=pixels(ao,px)[...,:1]
   y0=int(y*ATLAS);x0=int(x*ATLAS);atlas[y0:y0+px,x0:x0+px]=tile
  uv=me.uv_layers.active.data
  lo=[1e9,1e9];hi=[-1e9,-1e9]
  for d in uv:
   u,v=d.uv;lo=[min(lo[0],u),min(lo[1],v)];hi=[max(hi[0],u),max(hi[1],v)]
   d.uv=(x+min(max(u,0),1)*s,y+min(max(v,0),1)*s)
  print('PART',role,o.name,len(me.vertices),'uv',[round(t,3) for t in lo+hi],'img',img and img.name)
  parts.append((n,role))
 # Regions, as a colour attribute the glTF exporter writes as COLOR_0 (r = region / 8).
 REG={'body':0,'top':1,'outfit2':1,'shoes':4,'hair':3,'eyes':5,'eyebrows':5,'eyelashes':5}
 legs=None
 for n,role in parts:
  me=n.data;col=me.color_attributes.new('region','FLOAT_COLOR','CORNER')
  gi={g.index:g.name for g in n.vertex_groups}
  # Trousers and skirts are the pieces of an outfit carried by the legs, decided per UV island
  # (a piece of the garment's texture), by majority: a shirt's hem hangs over the thighs and is
  # still the shirt, and a shirt sewn to its jeans in one mesh is still two pieces of texture.
  # Per corner, so a vertex on the seam between the two carries both.
  uv=me.uv_layers.active.data;nl=len(me.loops)
  parent=list(range(nl))
  def find(a):
   while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
   return a
  def union(a,b):
   a,b=find(a),find(b)
   if a!=b:parent[a]=b
  at={}
  for poly in me.polygons:
   li=list(poly.loop_indices)
   for k in li[1:]:union(li[0],k)
   for k in li:
    key=(me.loops[k].vertex_index,round(uv[k].uv[0],5),round(uv[k].uv[1],5))
    if key in at:union(at[key],k)
    else:at[key]=k
  legv=[]
  for v in me.vertices:
   w=sorted(((g.weight,gi[g.group]) for g in v.groups),reverse=True)
   legv.append(bool(w and w[0][1] in LEGS))
  votes={}
  for k in range(nl):
   t=votes.setdefault(find(k),[0,0]);t[1]+=1
   if legv[me.loops[k].vertex_index]:t[0]+=1
  for k in range(nl):
   r=REG[role]
   if role in('top','outfit2'):
    t=votes[find(k)]
    if t[0]>t[1]*.5:r=2
   col.data[k].color=(r/8,0,0,1)
 # Tint masks. A region is recoloured per person (the crowd's palette); within it, only the
 # texels near that region's dominant colour are -- a suit's jacket, not its white collar or its
 # tie; a shirt and the jeans under it each by their own. The dominant colour is the median of
 # the texels the region's own corners sample. Alpha carries the mask, except in the tiles of
 # hair, brows, lashes and eyes, where it stays the cut-out.
 means={}
 NAMES=['skin','top','bottom','hair','shoe']
 CUT=('hair','eyebrows','eyelashes','eyes')
 samples={k:[] for k in range(5)};tiles_of={k:set() for k in range(5)};tris={k:[] for k in range(5)}
 for n,role in parts:
  me=n.data;reg=me.color_attributes['region'].data;uv=me.uv_layers.active.data
  for poly in me.polygons:
   for li in poly.loop_indices:
    r=int(round(reg[li].color[0]*8))
    if r<5:samples[r].append(uv[li].uv[:]);tiles_of[r].add(role)
   li=list(poly.loop_indices);r=int(round(reg[li[0]].color[0]*8))
   if r<5:
    for k in range(1,len(li)-1):tris[r].append([uv[li[0]].uv[:],uv[li[k]].uv[:],uv[li[k+1]].uv[:]])
 mask={}
 for r,uvs in samples.items():
  if not uvs:continue
  uvs=np.array(uvs);ij=np.clip((uvs[:,::-1]*ATLAS).astype(int),0,ATLAS-1)
  samp=atlas[ij[:,0],ij[:,1]]
  if r==3:samp=samp[samp[:,3]>.5]
  if not len(samp):continue
  dom=np.median(samp[:,:3],axis=0)
  lin=np.where(dom<=.04045,dom/12.92,((dom+.055)/1.055)**2.4);means[NAMES[r]]=[round(float(v),5) for v in lin]
  for role in tiles_of[r]:
   if role in CUT:continue
   x,y,s=TILES[role];px=int(s*ATLAS);y0=int(y*ATLAS);x0=int(x*ATLAS);tile=atlas[y0:y0+px,x0:x0+px]
   d=np.linalg.norm(tile[...,:3]-dom,axis=-1);t=np.clip((d-.16)/(.38-.16),0,1);m=1-t*t*(3-2*t)
   # A plain garment (spec "plain": ["top"]): whatever is printed on it -- MakeHuman's logo on
   # its T-shirts -- is painted out in the garment's own colour, only inside this region's own
   # triangles (a shirt and its jeans share one texture).
   if NAMES[r] in c.get('plain',[]):
    cover=np.zeros(m.shape,bool)
    for tri in tris[r]:
     t=(np.array(tri)-[x,y])/s*px
     if t[:,0].min()<0 or t[:,1].min()<0 or t[:,0].max()>px or t[:,1].max()>px:continue
     j0,j1=int(t[:,0].min()),int(np.ceil(t[:,0].max()));i0,i1=int(t[:,1].min()),int(np.ceil(t[:,1].max()))
     jj,ii=np.meshgrid(np.arange(j0,j1+1),np.arange(i0,i1+1));P=np.stack([jj+.5,ii+.5],-1)
     a0,b0,c0=t;v0=c0-a0;v1=b0-a0;v2=P-a0
     d00=v0@v0;d01=v0@v1;d11=v1@v1;d20=v2@v0;d21=v2@v1;den=d00*d11-d01*d01
     if abs(den)<1e-9:continue
     u=(d11*d20-d01*d21)/den;v=(d00*d21-d01*d20)/den;inside=(u>=-.02)&(v>=-.02)&(u+v<=1.04)
     cover[np.clip(ii[inside],0,px-1),np.clip(jj[inside],0,px-1)]=True
    # Inside the garment: its own colour, keeping only the shading (luminance relative to the
    # dominant colour, held within 0.93-1.03; anything further off is print and takes the plain colour).
    lum=lambda a:a[...,0]*.2126+a[...,1]*.7152+a[...,2]*.0722
    ratio=lum(tile[...,:3])/max(1e-4,float(lum(dom)));k=np.where((ratio<.88)|(ratio>1.12),1.0,np.clip(ratio,.93,1.03))
    # Broad folds only: the shading blurred over a few texels inside the garment, so the edges of
    # what was printed do not survive as a ghost.
    def box(a,rad):
     c=np.cumsum(np.cumsum(np.pad(a,((rad+1,rad),(rad+1,rad))),0),1)
     return c[2*rad+1:,2*rad+1:]-c[:-2*rad-1,2*rad+1:]-c[2*rad+1:,:-2*rad-1]+c[:-2*rad-1,:-2*rad-1]
    w=cover.astype(np.float64);k=(box(k*w,6)/np.maximum(box(w,6),1e-6)).astype(np.float32)
    tile[cover,:3]=(dom[None,:]*k[cover][:,None]);m=np.maximum(m,cover.astype(np.float32))
   key=role;mask[key]=np.maximum(mask.get(key,np.zeros_like(m)),m)
 for role,m in mask.items():
  x,y,s=TILES[role];px=int(s*ATLAS);y0=int(y*ATLAS);x0=int(x*ATLAS);atlas[y0:y0+px,x0:x0+px,3]=m
 # Join, skin to the Quaternius armature (MPFB's 'head'/'Root' are its 'Head'/'root').
 bpy.ops.object.select_all(action='DESELECT')
 for n,_ in parts:n.select_set(True)
 bpy.context.view_layer.objects.active=parts[0][0];bpy.ops.object.join()
 body=bpy.context.view_layer.objects.active;body.name=c['id']
 for vg in body.vertex_groups:
  if vg.name=='head':vg.name='Head'
  elif vg.name=='Root':vg.name='root'
 qb=set(Q.data.bones.keys())
 for vg in list(body.vertex_groups):
  if vg.name not in qb:body.vertex_groups.remove(vg)
 body.data.materials.clear()
 mat=bpy.data.materials.new(c['id']);body.data.materials.append(mat)
 arm=natural_armature(Q,rig,c['id']) if natural else Q
 body.parent=arm;m=body.modifiers.new('arm','ARMATURE');m.object=arm
 # Clean up everything MPFB made (and, for a natural fit, the crowd skeleton it was posed to).
 for o in list(bpy.data.objects):
  if o not in (arm,body):bpy.data.objects.remove(o)
 Q=arm;Q.name='Armature';Q.data.pose_position='POSE'
 img=bpy.data.images.new(c['id']+'-atlas',ATLAS,ATLAS,alpha=True);img.pixels[:]=np.clip(atlas,0,1).ravel()
 img.filepath_raw=os.path.join(out,c['id']+'.png');img.file_format='PNG';img.save()
 img.filepath_raw=os.path.join(out,c['id']+'.webp');img.file_format='WEBP';bpy.context.scene.render.image_settings.quality=88;img.save()
 json.dump({'id':c['id'],'atlas':ATLAS,'means':means,'macro':c['macro'],'outfit':c['outfit'],'shoes':c['shoes'],'hair':c.get('hair'),'skin':c['skin']},open(os.path.join(out,c['id']+'.json'),'w'),indent=1)
 bpy.ops.object.select_all(action='DESELECT');body.select_set(True);Q.select_set(True)
 bpy.ops.export_scene.gltf(filepath=os.path.join(out,c['id']+'.glb'),use_selection=True,export_animations=False,
  export_materials='NONE',export_attributes=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False,export_skins=True,export_def_bones=False)
 tris=sum(len(p.vertices)-2 for p in body.data.polygons)
 print('BUILT',c['id'],len(body.data.vertices),'verts',tris,'tris')
 return body

for c in spec['citizens']:
 if only and c['id'] not in only:continue
 clear();Q=skeleton();build(c,Q)
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out,c['id']+'.blend'))
