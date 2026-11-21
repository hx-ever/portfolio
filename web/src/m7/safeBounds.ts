import * as THREE from "three";
import { SAFE_BOUNDS } from "./config";

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // m_7's depth (z = 0)
const hit = new THREE.Vector3();

/** World y (on m_7's z = 0 plane) of a pixel row of his canvas. */
function worldYAtPixelRow(camera: THREE.Camera, canvasHeight: number, rowPx: number) {
  ndc.set(0, 1 - (2 * rowPx) / canvasHeight);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(plane, hit) ? hit.y : null;
}

/**
 * Stage safe bounds for m_7: the root-group y that keeps his highest point
 * in ANY state (Win's raised arm) at least `navMarginPx` below the fixed
 * nav's bottom edge, without lifting him above his layout's `baseY` and
 * without pushing his feet below the canvas. Pure framing — his size never
 * changes. Assumes the hero canvas starts at the top of the viewport (it
 * does whenever the hero is at rest in view).
 */
export function safeStageY(
  camera: THREE.Camera,
  canvasHeightPx: number,
  navBottomPx: number,
  groupScale: number,
  baseY: number
) {
  if (!canvasHeightPx) return baseY;
  const ceiling = worldYAtPixelRow(camera, canvasHeightPx, navBottomPx + SAFE_BOUNDS.navMarginPx);
  const floor = worldYAtPixelRow(camera, canvasHeightPx, canvasHeightPx - SAFE_BOUNDS.bottomMarginPx);
  if (ceiling === null || floor === null) return baseY;
  const highestAllowed = ceiling - SAFE_BOUNDS.peakLocal * groupScale;
  const lowestAllowed = floor - SAFE_BOUNDS.feetLocal * groupScale;
  // lower him only as far as the nav needs; never into the canvas floor
  return Math.max(Math.min(baseY, highestAllowed), lowestAllowed);
}
