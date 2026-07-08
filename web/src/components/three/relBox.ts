import * as THREE from "three";

/**
 * Bounding box of `root`'s meshes in a GLB scene-root frame. `inv` is the
 * inverse of the scene root's matrixWorld: multiplying it in cancels every
 * ancestor transform, so measurements stay correct even when the shared
 * useGLTF scene is still attached to a scaled/rotated tree (e.g. on remount
 * or fast-refresh) — measuring plain world boxes there would be contaminated.
 */
export function relBox(root: THREE.Object3D, inv: THREE.Matrix4) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld));
    box.union(tmp);
  });
  return box;
}
