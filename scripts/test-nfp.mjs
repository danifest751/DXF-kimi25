import { Minkowski, Path64, Paths64, Point64 } from 'clipper2-js';

const SCALE = 1000;
function toPath64(pts) {
  const p = new Path64();
  for (const pt of pts) p.push(new Point64(Math.round(pt.x * SCALE), Math.round(pt.y * SCALE)));
  return p;
}
function fromPaths64(paths) {
  const res = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const pts = [];
    for (let j = 0; j < path.length; j++) {
      const pt = path[j];
      pts.push({ x: pt.x / SCALE, y: pt.y / SCALE });
    }
    if (pts.length >= 3) res.push(pts);
  }
  return res;
}

// A = 100x100 square, CCW
const A = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
// B = 50x50 square, CCW
const B = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }];

// reflect B for Minkowski sum → NFP
const Br = B.map(p => ({ x: -p.x, y: -p.y }));

const pathA = toPath64(A);
const pathBr = toPath64(Br);
const raw = Minkowski.sum(pathA, pathBr, true);
const nfp = fromPaths64(raw);

process.stdout.write('NFP polygons: ' + nfp.length + '\n');
if (nfp[0]) {
  process.stdout.write('NFP[0] pts: ' + JSON.stringify(nfp[0]) + '\n');
}
// For B(50x50) against A(100x100):
// B's reference (0,0) can be at x in [-50..100], y in [-50..100]
// NFP should be roughly a 150x150 polygon centred around A
process.stdout.write('Expected corners approx: x in [-50..100], y in [-50..100]\n');
