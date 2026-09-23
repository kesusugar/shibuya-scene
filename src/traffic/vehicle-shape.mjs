// What a car is shaped like.
//
// The old geometry was two rounded boxes that both ran the full length of the vehicle, with a
// third box on top for the cabin. That is a flat deck carrying a cabin, which is a pickup
// truck, and no amount of material work makes it read as a saloon. See
// docs/VEHICLE-VISUAL-AUDIT.md for the measurement.
//
// This builds a body the way a body is actually shaped: a loft. A handful of cross-sections
// are placed along the length, each one a closed outline, and consecutive sections are stitched
// into a surface. That buys the three things boxes cannot express --
//
//   a bonnet lower than the beltline, and a boot lower still, which is what makes a
//   three-box car read as three boxes rather than one;
//   a raked windscreen, which is the single strongest cue that a shape is a car and is
//   impossible with axis-aligned geometry;
//   wheel arches, because the sill line can rise over each axle independently of the floor,
//   so the flank cuts in around the wheel instead of ending flat against it;
//
// -- and it costs about the same as the boxes did, because a loft is quads.
//
// The module returns geometry and anchor points only. It knows nothing about three's materials,
// the player, or the traffic simulation, so the same profile can be built dense for the car
// under the camera and sparse for the ones in the distance.
import {BufferGeometry,BufferAttribute,BoxGeometry,CylinderGeometry,TorusGeometry} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {VEHICLES} from './config.mjs';

/**
 * Silhouettes, as fractions so one profile fits every size of the same body style.
 *
 * `z` runs from the tail (-.5) to the nose (+.5) of the length. `belt` is the top of the
 * painted lower body -- the bonnet, the sill-to-shoulder line, the boot lid -- and `house` is
 * the greenhouse above it. `w` is the half width as a fraction of the full width. Between the
 * last bonnet station and the first roof station the greenhouse climbs, and how fast it climbs
 * is the windscreen rake.
 */
const SILHOUETTE={
 // Three-box saloon. The bonnet steps down off the scuttle, the boot lid sits below the
 // beltline, and the windscreen is raked about 66 degrees off vertical against a 51-degree
 // backlight -- a saloon leans its screen back much further than its rear window, and getting
 // that the wrong way round is what makes a shape read as a van.
 sedan:{
  belt:[[-.500,.585,.79],[-.466,.672,.89],[-.432,.712,.945],[-.375,.726,.985],[-.310,.728,1],
        [-.290,.752,1],[ .000,.755,1],[ .200,.755,1],[ .296,.748,1],
        [ .330,.672,.995],[ .410,.648,.97],[ .462,.612,.90],[ .500,.560,.79]],
  house:[[-.300,.752,.78],[-.255,.880,.85],[-.225,.952,.885],[-.185,.996,.905],
         [-.050,1.000,.910],[ .080,1.000,.910],[ .120,.996,.905],
         [ .200,.934,.885],[ .270,.832,.85],[ .330,.700,.78]],
  floor:.155, arch:.325, axle:.300, plate:'both'
 },
 // Tall two-box hatch: a short bonnet and a cabin carried almost to the tail.
 hatch:{
  belt:[[-.500,.615,.81],[-.470,.690,.90],[-.436,.726,.95],[-.380,.740,.99],[-.150,.744,1],
        [ .150,.744,1],[ .262,.740,1],[ .300,.672,.995],[ .390,.640,.97],[ .452,.600,.92],
        [ .500,.545,.81]],
  house:[[-.412,.742,.81],[-.392,.880,.86],[-.372,.952,.895],[-.330,.994,.915],
         [-.050,1.000,.920],[ .080,1.000,.920],[ .130,.992,.912],
         [ .195,.928,.895],[ .255,.830,.86],[ .300,.720,.79]],
  floor:.165, arch:.345, axle:.315, plate:'both'
 },
 // One box: the screen starts near the bumper and the roof runs nearly the whole length.
 onebox:{
  belt:[[-.500,.430,.82],[-.478,.520,.90],[-.450,.565,.95],[-.380,.580,.99],[ .000,.585,1],
        [ .330,.585,1],[ .400,.575,.99],[ .430,.520,.96],[ .470,.480,.91],[ .500,.420,.83]],
  house:[[-.470,.590,.83],[-.452,.770,.90],[-.436,.905,.94],[-.400,.978,.958],[ .120,1.000,.962],
         [ .300,.998,.958],[ .378,.950,.935],[ .430,.820,.88],[ .466,.600,.82]],
  floor:.120, arch:.300, axle:.320, plate:'both'
 },
 // Cab over the front axle, flat deck behind it.
 cabover:{
  belt:[[-.500,.615,.84],[-.470,.658,.92],[-.430,.672,.97],[ .060,.676,1],[ .090,.700,1],
        [ .250,.700,1],[ .392,.690,.99],[ .460,.618,.93],[ .500,.510,.82]],
  house:[[ .072,.700,.86],[ .096,.868,.92],[ .120,.962,.95],[ .180,1.000,.962],[ .330,.998,.958],
         [ .400,.944,.93],[ .452,.800,.86],[ .486,.690,.80]],
  floor:.170, arch:.330, axle:.315, plate:'rear'
 }
};
const STYLE={taxi:'sedan',sedan:'sedan',kei:'hatch',van:'onebox',bus:'onebox',keiTruck:'cabover'};

/** Wheel radius, tuned so the tyre fills its arch instead of hanging under a flat sill. */
export const wheelRadius=type=>type==='bus'?.46:type==='kei'||type==='keiTruck'?.28:.33;

const lerp=(a,b,t)=>a+(b-a)*t;
// Nothing on a vehicle is textured and a loft has no UVs to begin with, so the primitives'
// unused UV sets are dropped before anything is merged -- mergeGeometries refuses a mixed pile.
const bare=g=>{g.deleteAttribute('uv');g.deleteAttribute('uv1');g.deleteAttribute('uv2');return g;};
/** Sample a profile table at z, holding the end values outside the table. */
function at(table,z){
 if(z<=table[0][0])return [table[0][1],table[0][2]];
 for(let i=1;i<table.length;i++){
  if(z>table[i][0])continue;
  const [z0,y0,w0]=table[i-1],[z1,y1,w1]=table[i];
  const t=(z-z0)/(z1-z0||1);return [lerp(y0,y1,t),lerp(w0,w1,t)];
 }
 const last=table[table.length-1];return [last[1],last[2]];
}

/**
 * Stitch a list of cross-sections into a surface.
 *
 * Each section is a closed ring of {x, y, crease} in the plane of that station. A point marked
 * `crease` is emitted as two vertices at the same position, so the faces either side of it do
 * not share a normal and the edge stays sharp -- which is how a beltline or a wheel arch reads
 * as a line rather than as a soft bulge, without authoring normals by hand.
 */
function loft(stations,{capFront=true,capBack=true}={}){
 const positions=[],indices=[];
 const ringSize=stations[0].ring.reduce((n,p)=>n+(p.crease?2:1),0);
 for(const {z,ring} of stations){
  for(const p of ring){positions.push(p.x,p.y,z);if(p.crease)positions.push(p.x,p.y,z);}
 }
 // Each crease point contributes an upper copy and a lower copy; walking the emitted ring in
 // order pairs them correctly because the duplicate immediately follows the original.
 for(let s=0;s<stations.length-1;s++){
  const a=s*ringSize,b=(s+1)*ringSize;
  for(let i=0;i<ringSize;i++){
   const j=(i+1)%ringSize;
   // Wound so the face normal points OUT of the ring. RUN 10 found this the other way round:
   // every lofted part -- body, glasshouse, roof, beltline -- had negative signed volume, i.e.
   // was built inside-out, so back-face culling hid the near outer skin and drew the far
   // inner wall instead. The player's car read as a hollow shell you could see into: the
   // boot showed the wheels from inside, and the flanks looked like glass.
   indices.push(a+i,b+j,b+i, a+i,a+j,b+j);
  }
 }
 // Caps are a fan to the ring's centroid, which is convex enough for these outlines.
 const cap=(station,offset,flip)=>{
  let cx=0,cy=0,n=0;
  for(let i=0;i<ringSize;i++){cx+=positions[(offset+i)*3];cy+=positions[(offset+i)*3+1];n++;}
  const centre=positions.length/3;positions.push(cx/n,cy/n,station.z);
  for(let i=0;i<ringSize;i++){
   const j=(i+1)%ringSize;
   if(flip)indices.push(centre,offset+i,offset+j);else indices.push(centre,offset+j,offset+i);
  }
 };
 // The ring is authored in one rotational sense, which is the outward sense at one end and the
 // inward sense at the other, so exactly one cap is reversed. Get it wrong and back-face
 // culling turns the car into something you can see straight through from bumper to bumper.
 if(capBack)cap(stations[0],0,true);
 if(capFront)cap(stations[stations.length-1],(stations.length-1)*ringSize,false);
 const geometry=new BufferGeometry();
 geometry.setAttribute('position',new BufferAttribute(new Float32Array(positions),3));
 geometry.setIndex(indices);
 geometry.computeVertexNormals();
 return geometry;
}

/** One rounded corner's worth of points, from `from` to `to` turning through a quarter turn. */
function corner(cx,cy,r,from,to,steps){
 const out=[];
 for(let i=0;i<=steps;i++){const a=lerp(from,to,i/steps);out.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});}
 return out;
}

/**
 * The outline of the painted lower body at one station.
 *
 * `sill` is where the flank meets the underside, and it is the wheel arch: raising it over an
 * axle cuts the flank away around the wheel while the floor stays where it is.
 */
function bodyRing(halfWidth,floor,sill,belt,round){
 const half=[];
 half.push({x:0,y:floor});
 half.push({x:halfWidth*.80,y:floor});
 half.push(...corner(halfWidth*.80,floor+round,round,-Math.PI/2,0,2).slice(1));
 half.push({x:halfWidth*.80+round,y:sill,crease:true});          // arch / rocker line
 half.push({x:halfWidth,y:sill+(belt-sill)*.34});
 half.push({x:halfWidth,y:belt-round*1.6});
 half.push(...corner(halfWidth-round*.9,belt-round*1.6,round*.9,0,Math.PI/2,2).slice(1));
 half.push({x:halfWidth-round*2.2,y:belt,crease:true});          // beltline
 half.push({x:0,y:belt});
 // Mirror, skipping the two points that sit on the centreline.
 const ring=[...half];
 for(let i=half.length-2;i>0;i--)ring.push({...half[i],x:-half[i].x});
 return ring;
}

/** A simple capped slab outline, for the roof panel. */
function panelRing(halfWidth,bottom,top,round){
 const half=[{x:0,y:bottom},{x:halfWidth-round,y:bottom}];
 half.push(...corner(halfWidth-round,bottom+round,round,-Math.PI/2,0,2).slice(1));
 half.push({x:halfWidth,y:top-round});
 half.push(...corner(halfWidth-round,top-round,round,0,Math.PI/2,2).slice(1));
 half.push({x:0,y:top});
 const ring=[...half];
 for(let i=half.length-2;i>0;i--)ring.push({...half[i],x:-half[i].x});
 return ring;
}

/** The greenhouse outline: narrower, with tumblehome, and a crease where it meets the belt. */
function houseRing(halfWidth,belt,top,round){
 const half=[];
 half.push({x:0,y:belt});
 half.push({x:halfWidth,y:belt,crease:true});
 half.push({x:halfWidth*.985,y:lerp(belt,top,.45)});
 half.push({x:halfWidth*.93,y:top-round});
 half.push(...corner(halfWidth*.93-round,top-round,round,0,Math.PI/2,2).slice(1));
 half.push({x:halfWidth*.93-round*1.4,y:top,crease:true});
 half.push({x:0,y:top});
 const ring=[...half];
 for(let i=half.length-2;i>0;i--)ring.push({...half[i],x:-half[i].x});
 return ring;
}

/**
 * Build one vehicle's geometry.
 *
 * `detail` scales the number of stations and the roundness of wheels, so the same silhouette
 * serves the car under the camera and the ones two blocks away. Returns geometry grouped by
 * the material it wants, plus the anchors the game drives and the ones RUN 10 and RUN 11 will.
 */
export function buildVehicleShape(type,{detail=1}={}){
 const d=VEHICLES[type],profile=SILHOUETTE[STYLE[type]??'sedan'];
 const L=d.length,W=d.width,H=d.height;
 const radius=wheelRadius(type);
 const parts={paint:[],glass:[],rubber:[],rim:[],lamp:[],tail:[],dark:[],plate:[]};
 const round=Math.min(.09,W*.055);

 // --- lower body -------------------------------------------------------------------------
 const axleZ=L*profile.axle,archSpan=radius*1.28;
 const floorY=H*profile.floor;
 // Sill height: the flat rocker between the axles, rising into an arch over each of them.
 const sillAt=z=>{
  const base=H*profile.arch;
  let lift=0;
  for(const centre of [-axleZ,axleZ]){
   const t=Math.max(0,1-Math.abs(z-centre)/archSpan);
   lift=Math.max(lift,Math.sin(t*Math.PI/2)*(radius*1.06-base+H*.055));
  }
  return base+lift;
 };
 const steps=Math.max(16,Math.round(34*detail));
 const bodyStations=[];
 for(let i=0;i<=steps;i++){
  const f=-.5+i/steps,z=f*L;
  const [beltF,widthF]=at(profile.belt,f);
  // Extra stations are worth spending near the arches; a coarse sample there flattens them.
  bodyStations.push({z,ring:bodyRing(W/2*widthF,floorY,Math.min(sillAt(z),H*beltF-H*.07),H*beltF,round)});
 }
 parts.paint.push(loft(bodyStations));

 // --- greenhouse -------------------------------------------------------------------------
 const houseSteps=Math.max(10,Math.round(20*detail));
 const houseFrom=profile.house[0][0],houseTo=profile.house[profile.house.length-1][0];
 const houseStations=[];
 for(let i=0;i<=houseSteps;i++){
  const f=lerp(houseFrom,houseTo,i/houseSteps),z=f*L;
  const [topF,widthF]=at(profile.house,f);
  const [beltF]=at(profile.belt,f);
  houseStations.push({z,ring:houseRing(W/2*widthF,H*beltF-.012,H*topF,round*.8)});
 }
 // The greenhouse is glass with a painted roof; splitting it by height would need a seam, so
 // it is built once in glass and the roof panel is laid over it.
 // Capped at both ends. The first and last stations are a centimetre-tall band where the
 // screen meets the body, so the caps are slivers -- but leaving the tube open lets the cabin
 // interior show through the windscreen base, which reads as a black box sitting on the car.
 parts.glass.push(loft(houseStations));

 // --- roof panel --------------------------------------------------------------------------
 // Only over the part of the greenhouse that is actually flat. Running it the whole length
 // would lay paint across both screens; pinching it to nothing at the ends, as a first attempt
 // did, collapses the ring into a self-intersecting sliver.
 {
  const flat=profile.house.filter(([,y])=>y>=.985);
  const from=flat.length?flat[0][0]:houseFrom,to=flat.length?flat[flat.length-1][0]:houseTo;
  const roofStations=[];
  const span=Math.max(4,Math.round(8*detail));
  for(let i=0;i<=span;i++){
   const f=lerp(from-.022,to+.022,i/span),z=f*L;
   const [topF,widthF]=at(profile.house,f);
   // The same width the greenhouse has at its top edge, less a hair. Wider than that and the
   // panel overhangs the glass, which is what makes a roof look like a tray carried on posts.
   const w=W/2*widthF*.93-round*1.5;
   roofStations.push({z,ring:panelRing(Math.max(.02,w),H*topF-.05,H*topF+.006,round*.6)});
  }
  parts.paint.push(loft(roofStations));
 }

 // --- pillars and window frame ---------------------------------------------------------------
 // Without these the greenhouse is one continuous pane and reads as a black box sitting on the
 // car. Painted posts at the screen edges and one in the middle, plus a strip along the belt,
 // turn it into a windscreen, two side windows and a backlight -- which is the difference
 // between a cabin and a tinted brick.
 {
  const flat=profile.house.filter(([,y])=>y>=.985);
  const aPost=flat.length?flat[flat.length-1][0]:houseTo-.04;
  const cPost=flat.length?flat[0][0]:houseFrom+.04;
  const bPost=(aPost+cPost)/2;
  for(const [f,thickness] of [[aPost,.07],[bPost,.055],[cPost,.065]]){
   const [topF,widthF]=at(profile.house,f),[beltF]=at(profile.belt,f);
   const height=H*(topF-beltF);
   if(height<.06)continue;
   for(const side of [-1,1]){
    // Placed at the width the glass has halfway up, so the post sits in the surface rather
    // than proud of it at one end and buried at the other.
    const post=new BoxGeometry(.05,height,thickness);
    post.translate(side*W/2*widthF*.955,H*(topF+beltF)/2,f*L);
    parts.paint.push(post);
   }
  }
  // The belt strip closes the bottom of the glass, so the window has a sill to sit on.
  const beltStations=[];
  const beltSpan=Math.max(6,Math.round(14*detail));
  for(let i=0;i<=beltSpan;i++){
   const f=lerp(houseFrom,houseTo,i/beltSpan),z=f*L;
   const [,widthF]=at(profile.house,f),[beltF]=at(profile.belt,f);
   beltStations.push({z,ring:panelRing(W/2*widthF*.975,H*beltF-.028,H*beltF+.026,round*.5)});
  }
  parts.paint.push(loft(beltStations));
 }

 // --- doors -----------------------------------------------------------------------------------
 // A panel on its own hinge, so entering and leaving a car can swing it. It sits a centimetre
 // inside the flank rather than proud of it: there is no hole in a lofted body to drop a door
 // into, and a panel standing on the surface is what made the old model look bolted together.
 const doors=[];
 {
  const flat=profile.house.filter(([,y])=>y>=.985);
  const aPost=flat.length?flat[flat.length-1][0]:houseTo-.04;
  const cPost=flat.length?flat[0][0]:houseFrom+.04;
  const hingeF=aPost-.012,span=Math.abs(aPost-cPost)*.52;
  const [beltF,widthF]=at(profile.belt,hingeF);
  const top=H*beltF-.03,bottom=H*profile.arch+.05;
  for(const side of [-1,1]){
   const panel=new BoxGeometry(.045,Math.max(.18,top-bottom),Math.max(.3,span*L));
   panel.translate(0,0,-Math.max(.3,span*L)/2);
   doors.push({side,hinge:[side*(W/2*widthF-.015),(top+bottom)/2,hingeF*L],panel:bare(panel)});
  }
 }

 // Modern bumpers are painted, with a dark valance under them. An all-black bar across the
 // nose reads as a truck fitting, which is what the first attempt looked like.
 for(const [end,z] of [['front',L*.5],['rear',-L*.5]]){
  const [,widthF]=at(profile.belt,end==='front'?.5:-.5);
  const inward=end==='front'?-1:1;
  const bar=new BoxGeometry(W*widthF*1.005,H*.135,.13);
  bar.translate(0,H*profile.arch*1.02,z+inward*.035);parts.paint.push(bar);
  const valance=new BoxGeometry(W*widthF*.90,H*.075,.11);
  valance.translate(0,H*profile.arch*.62,z+inward*.05);parts.dark.push(valance);
 }

 // --- grille and lamps ---------------------------------------------------------------------
 const noseZ=L*.5,tailZ=-L*.5;
 const [noseBelt,noseWidth]=at(profile.belt,.5),[tailBelt,tailWidth]=at(profile.belt,-.5);
 const grille=new BoxGeometry(W*noseWidth*.40,H*.075,.055);
 grille.translate(0,H*noseBelt-H*.10,noseZ-.02);parts.dark.push(grille);
 for(const side of [-1,1]){
  // Headlights sit just under the bonnet edge, not halfway down the bumper, and they are
  // narrower than the grille between them -- a pair of wide cream slabs reads as a light bar.
  const head=new BoxGeometry(W*noseWidth*.22,H*.070,.06);
  head.translate(side*W*noseWidth*.335,H*noseBelt-H*.075,noseZ-.025);parts.lamp.push(head);
  const lamp=new BoxGeometry(W*tailWidth*.22,H*.085,.055);
  lamp.translate(side*W*tailWidth*.355,H*tailBelt-H*.085,tailZ+.02);parts.tail.push(lamp);
 }
 // The plate belongs on the bumper, not floating on the body between the lights.
 for(const [where,z,widthF] of [['front',noseZ-.005,noseWidth],['rear',tailZ+.005,tailWidth]]){
  if(profile.plate==='rear'&&where==='front')continue;
  const plate=new BoxGeometry(W*widthF*.185,H*.050,.02);
  plate.translate(0,H*profile.arch*1.02,z);parts.plate.push(plate);
 }

 // --- mirrors: small, on a stalk at the base of the A-pillar --------------------------------
 const [mirrorTop,mirrorWidth]=at(profile.house,houseFrom+.02);
 const [mirrorBelt]=at(profile.belt,houseFrom+.02);
 for(const side of [-1,1]){
  const stalk=new BoxGeometry(.055,.035,.045);
  stalk.translate(side*W/2*mirrorWidth*.99,H*mirrorBelt+.055,(houseFrom+.03)*L);parts.paint.push(stalk);
  const shell=new BoxGeometry(.045,.075,.135);
  shell.translate(side*(W/2*mirrorWidth*.99+.055),H*mirrorBelt+.06,(houseFrom+.035)*L);parts.paint.push(shell);
  void mirrorTop;
 }

 // --- wheels ---------------------------------------------------------------------------------
 // Built at the origin: each one is its own anchor, so the game moves and turns them.
 const segments=Math.max(10,Math.round(22*detail));
 const width=radius*.62;
 // A tyre is a closed ring, not an open tube: left open-ended, the rim floats inside a hoop and
 // the gap between them reads as a hole straight through the wheel.
 const tread=new CylinderGeometry(radius,radius,width,segments,1,true);tread.rotateZ(Math.PI/2);
 const sidewalls=[];
 for(const s of [-1,1]){
  const wall=new CylinderGeometry(radius,radius*.70,width*.16,segments,1,true);
  wall.rotateZ(Math.PI/2);wall.translate(s*width*.58,0,0);sidewalls.push(wall);
 }
 const wheelRubber=mergeGeometries([tread,...sidewalls].map(bare),false);
 tread.dispose();sidewalls.forEach(g=>g.dispose());
 const dish=new CylinderGeometry(radius*.70,radius*.70,width*.30,segments);
 dish.rotateZ(Math.PI/2);dish.translate(width*.35,0,0);
 const hub=new CylinderGeometry(radius*.26,radius*.26,width*.52,10);hub.rotateZ(Math.PI/2);
 hub.translate(width*.18,0,0);
 const spokes=[];
 for(let i=0;i<5;i++){
  const spoke=new BoxGeometry(width*.16,radius*.94,radius*.20);
  spoke.translate(0,radius*.30,0);spoke.rotateX(i*Math.PI*2/5);spoke.translate(width*.42,0,0);
  spokes.push(spoke);
 }
 const wheelRim=mergeGeometries([dish,hub,...spokes].map(bare),false);
 dish.dispose();hub.dispose();spokes.forEach(g=>g.dispose());

 // --- cabin interior ------------------------------------------------------------------------
 // Without something behind the glass you see straight through to the far window, and a
 // greenhouse with a view of its own inside surface reads as a glass ornament. A dark box and
 // two head restraints are enough: at any distance a driver is ever at, the cabin is a shadow
 // with shapes in it.
 {
  const front=profile.house[profile.house.length-1][0],back=profile.house[0][0];
  const [, frontWidth]=at(profile.house,front),[, backWidth]=at(profile.house,back);
  const mid=(front+back)/2,width=W*Math.min(frontWidth,backWidth)*.88;
  const [beltMid]=at(profile.belt,mid),[topMid]=at(profile.house,mid);
  // Low enough to sit under the beltline: a box that fills the glasshouse is a wall, and a
  // windscreen with a wall behind it is a tinted panel rather than a window.
  const cabin=new BoxGeometry(width,H*.10,(front-back)*L*.62);
  cabin.translate(0,H*beltMid-H*.02,mid*L);
  parts.dark.push(cabin);
  for(const side of [-1,1]){
   const seat=new BoxGeometry(W*.19,H*(topMid-beltMid)*.62,.10);
   seat.translate(side*W*.235,H*beltMid+H*(topMid-beltMid)*.28,mid*L-L*.055);
   parts.dark.push(seat);
  }
 }

 // --- wheel wells: a dark surface behind each tyre, so the arch is not a hole ----------------
 for(const z of [-axleZ,axleZ])for(const side of [-1,1]){
  const well=new CylinderGeometry(radius*1.02,radius*1.02,.02,14);
  well.rotateZ(Math.PI/2);well.translate(side*(W/2*.62),radius*.94,z);
  parts.dark.push(well);

 }

 const anchors={
  body:[0,0,0],
  frontLeftWheel:[-(W/2-width*.80),radius,axleZ],
  frontRightWheel:[ (W/2-width*.80),radius,axleZ],
  rearLeftWheel: [-(W/2-width*.80),radius,-axleZ],
  rearRightWheel:[ (W/2-width*.80),radius,-axleZ],
  // For RUN 10 and RUN 11. Measured from the front axle, which is where a driver sits in any
  // body style: the seat is where the hips end up, the door is the hinge the panel swings on,
  // and entry and exit are where the character stands before and after.
  driverSeat:[-W*.235,H*profile.arch+.12,axleZ-L*.085],
  driverDoor:[-W*.50, H*profile.arch+.24,axleZ-L*.105],
  driverEntry:[-(W*.5+.74),0,axleZ-L*.105],
  driverExit: [-(W*.5+.80),0,axleZ-L*.170]
 };

 // Everything in `parts` is already in body space; merge each material's pile into one mesh.
 const geometry={};
 for(const [name,list] of Object.entries(parts)){
  if(!list.length)continue;
  list.forEach(bare);
  geometry[name]=list.length===1?list[0]:mergeGeometries(list,false);
  if(list.length>1)list.forEach(g=>g.dispose());
 }
 return {geometry,wheel:{rubber:wheelRubber,rim:wheelRim,radius,width},anchors,doors,
  dimensions:{length:L,width:W,height:H,wheelbase:axleZ*2,radius}};
}
