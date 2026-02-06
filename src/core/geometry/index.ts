/**
 * @module core/geometry
 * Геометрические утилиты: математика, тесселяция кривых, bounding box.
 */

export {
  EPSILON,
  DEG2RAD,
  RAD2DEG,
  pt2,
  addPt2,
  subPt2,
  scalePt2,
  distPt2,
  lenPt2,
  pt3,
  addPt3,
  subPt3,
  scalePt3,
  distPt3,
  lenPt3,
  normalizePt3,
  dotPt3,
  crossPt3,
  vec3,
  vec3ToPoint,
  pointToVec3,
  lenVec3,
  normalizeVec3,
  IDENTITY_MATRIX,
  mat4Translation,
  mat4Scale,
  mat4RotationZ,
  mat4Multiply,
  mat4TransformPoint,
  buildInsertMatrix,
  ocsToWcsMatrix,
  normalizeAngle,
  lerp,
  lerpPt3,
  clamp,
} from './math.js';

export {
  tessellateArc,
  tessellateCircle,
  tessellateEllipse,
  tessellateSpline,
  tessellateBulge,
  tessellateLWPolyline,
} from './curves.js';

export {
  computeEntityBBox,
  computeAllBBoxes,
  mergeBBox,
} from './bbox.js';
