"""Merge MLIT PLATEAU building measurements into the scene data (docs/PLAN-REALITY.md, G2-1).

OSM gives the footprints and, for about two thirds of the buildings, a height tag that was itself
imported from PLATEAU. The rest had no height and the scene guessed one (mean error 9.6 m against
PLATEAU near the crossing). This attaches to every OSM building the PLATEAU building it overlaps
most, so the scene can use the measured height, and, near the crossing, the LOD2 roof steps
(rooftop plant, pavilions, sign frames) that stand above the main roof.

Inputs (not committed, ~360 MB): PLATEAU 13113 Shibuya-ku 2025 CityGML bldg tiles, e.g.
  https://api.plateauview.mlit.go.jp/datacatalog/citygml/m:53393596  (also 53393595, 53393586, 53393585)
Usage:
  python3 scripts/data/merge-plateau.py public/data/shibuya-scene-data.json 5339359*_bldg_6697_op.gml 5339358*_bldg_6697_op.gml
Needs: shapely. Licence: PLATEAU data (MLIT), attribution in THIRD_PARTY_NOTICES.md.
"""
import sys, json, math
import xml.etree.ElementTree as ET
from shapely.geometry import Polygon
from shapely.ops import unary_union
from shapely.strtree import STRtree

R = 6378137.0; DEG = math.pi / 180; LAT0, LON0 = 35.6595, 139.7005   # src/geo/core.mjs ORIGIN
def project(lat, lon): return ((lon - LON0) * DEG * R * math.cos(LAT0 * DEG), -(lat - LAT0) * DEG * R)
B = '{http://www.opengis.net/citygml/building/2.0}'; G = '{http://www.opengis.net/gml}'
ROOF_RADIUS = 220      # roof steps are kept only near the crossing, where they read against the sky
ROOF_MIN_AREA = 4.0    # m2; smaller roof surfaces are vents and railings

def rings(el):
    for pl in el.iter(G + 'posList'):
        v = list(map(float, pl.text.split()))
        yield [(project(v[i], v[i + 1]), v[i + 2]) for i in range(0, len(v), 3)]

def parse(path):
    out = []
    for _, el in ET.iterparse(path, events=('end',)):
        if el.tag != B + 'Building':
            continue
        foot = None
        for tag in ('lod0RoofEdge', 'lod0FootPrint', 'lod1Solid'):
            e = el.find(B + tag)
            if e is not None:
                r = next(rings(e), None)
                if r and len(r) >= 4:
                    foot = Polygon([p for p, _ in r]).buffer(0); break
        if foot is None or foot.is_empty:
            el.clear(); continue
        num = lambda t: (lambda x: float(x.text) if x is not None and x.text else None)(el.find(B + t))
        h = num('measuredHeight'); st = num('storeysAboveGround')
        ground = None; roofs = []
        for bb in el.findall(B + 'boundedBy'):
            for s in bb:
                kind = s.tag.split('}')[1]
                for r in rings(s):
                    zs = [z for _, z in r]
                    if kind == 'GroundSurface':
                        ground = min(zs) if ground is None else min(ground, min(zs))
                    elif kind == 'RoofSurface' and len(r) >= 4:
                        roofs.append((max(zs), [p for p, _ in r]))
        if ground is not None:
            roofs = [(z - ground, p) for z, p in roofs]
        else:
            roofs = []
        out.append(dict(id=el.get(G + 'id'), foot=foot, h=h if h and h > 0 else None,
                        storeys=int(st) if st and 0 < st < 200 else None, roofs=roofs))
        el.clear()
    return out

def roof_steps(b, main):
    """Roof surfaces standing at least 1 m above the main roof, merged per 0.5 m level."""
    levels = {}
    for z, ring in b['roofs']:
        if z < main + 1.0:
            continue
        try:
            poly = Polygon(ring).buffer(0)
        except Exception:
            continue
        if poly.area < .5:
            continue
        levels.setdefault(round(z * 2) / 2, []).append(poly)
    steps = []
    for y, polys in sorted(levels.items()):
        u = unary_union(polys).simplify(.25)
        for g in getattr(u, 'geoms', [u]):
            if g.geom_type == 'Polygon' and g.area >= ROOF_MIN_AREA:
                steps.append({'y': y, 'poly': [[round(x, 2), round(z, 2)] for x, z in list(g.exterior.coords)[:-1]]})
    return steps[:24]

def main():
    scene_path, gml = sys.argv[1], sys.argv[2:]
    plateau = [b for f in gml for b in parse(f)]
    tree = STRtree([b['foot'] for b in plateau])
    data = json.load(open(scene_path))
    stats = dict(buildings=len(data['buildings']), matched=0, roofSteps=0, plateau=len(plateau))
    for rec in data['buildings']:
        rec.pop('plateau', None)
        try:
            poly = Polygon(rec['polygon']['outer'], rec['polygon'].get('holes', [])).buffer(0)
        except Exception:
            continue
        if poly.is_empty or poly.area < 1:
            continue
        best, share = None, 0
        for i in tree.query(poly):
            cand = plateau[int(i)]
            inter = poly.intersection(cand['foot']).area
            if inter / poly.area > share and inter / cand['foot'].area >= .3:
                best, share = cand, inter / poly.area
        if best is None or share < .5 or best['h'] is None:
            continue
        top = max([best['h']] + [z for z, _ in best['roofs']])
        entry = {'id': best['id'], 'h': round(best['h'], 2), 'top': round(top, 2), 'share': round(share, 2)}
        if best['storeys']:
            entry['storeys'] = best['storeys']
        c = poly.centroid
        if math.hypot(c.x - 6.5, c.y - 2) < ROOF_RADIUS:
            steps = roof_steps(best, best['h'])
            if steps:
                entry['roofSteps'] = steps; stats['roofSteps'] += len(steps)
        rec['plateau'] = entry
        stats['matched'] += 1
    data['source']['plateau'] = {'provider': 'MLIT Project PLATEAU', 'dataset': '13113 Shibuya-ku 2025 CityGML (bldg)',
                                 'url': 'https://www.mlit.go.jp/plateau/open-data/', 'tiles': [f.split('/')[-1] for f in gml]}
    json.dump(data, open(scene_path, 'w'), separators=(',', ':'), ensure_ascii=False)
    print(json.dumps(stats))

if __name__ == '__main__':
    main()
