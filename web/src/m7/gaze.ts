import * as THREE from "three";
import { GAZE } from "./config";
import { pointer } from "./activity";

const FORWARD = new THREE.Vector3(0, 0, 1); // m_7 faces +Z in his own space

/**
 * Head/gaze tracking. Each frame (after the mixer and the in-place lock) it
 * projects the cursor onto a camera-facing plane at m_7's head depth, pulls
 * that point a little toward the viewer (so a cursor over his face reads as
 * eye contact), turns the direction into a clamped yaw/pitch in his own
 * frame, eases toward it, and adds the rotation on top of the clip's pose
 * across the neck → head chain.
 *
 * m_7 has no eye bones (the eyes are part of the head mesh), so the whole
 * look is carried by the neck and head.
 */
export class GazeController {
  private readonly bones: { bone: THREE.Object3D; share: number }[] = [];
  private readonly head: THREE.Object3D | null;
  private yaw = 0;
  private pitch = 0;

  // scratch
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane();
  private readonly hit = new THREE.Vector3();
  private readonly headPos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly charQ = new THREE.Quaternion();
  private readonly charQInv = new THREE.Quaternion();
  private readonly look = new THREE.Quaternion();
  private readonly part = new THREE.Quaternion();
  private readonly world = new THREE.Quaternion();
  private readonly parentQ = new THREE.Quaternion();
  private readonly parentQInv = new THREE.Quaternion();
  private readonly identity = new THREE.Quaternion();

  constructor(private readonly scene: THREE.Object3D) {
    for (const { name, share } of GAZE.bones) {
      const bone = scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
      if (bone) this.bones.push({ bone, share });
    }
    this.head = this.bones.at(-1)?.bone ?? null;
  }

  /** The resolved bone names, for diagnostics. */
  get boneNames() {
    return this.bones.map((b) => b.bone.name);
  }

  apply(
    dt: number,
    weight: number,
    camera: THREE.Camera,
    canvas: HTMLCanvasElement,
    reducedMotion: boolean
  ) {
    if (!this.head) return;
    const angleScale = reducedMotion ? GAZE.reducedMotionAngleScale : 1;
    const maxYaw = THREE.MathUtils.degToRad(GAZE.maxYawDeg) * angleScale;
    const maxPitch = THREE.MathUtils.degToRad(GAZE.maxPitchDeg) * angleScale;

    // target: the pointer while it's "present", otherwise neutral
    const now = performance.now();
    const present =
      pointer.kind === "mouse"
        ? pointer.active
        : pointer.active || (pointer.releasedAt > 0 && now - pointer.releasedAt < GAZE.touchReleaseMs);

    let targetYaw = 0;
    let targetPitch = 0;
    this.scene.getWorldQuaternion(this.charQ);
    this.charQInv.copy(this.charQ).invert();

    if (present && weight > 0) {
      const rect = canvas.getBoundingClientRect();
      this.ndc.set(
        ((pointer.x - rect.left) / rect.width) * 2 - 1,
        -((pointer.y - rect.top) / rect.height) * 2 + 1
      );
      this.head.getWorldPosition(this.headPos);
      // cursor → camera-facing plane through the head …
      this.raycaster.setFromCamera(this.ndc, camera);
      const toCamera = camera.getWorldDirection(this.dir).negate();
      this.plane.setFromNormalAndCoplanarPoint(toCamera, this.headPos);
      if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
        // … then step toward the viewer: that's what he looks at
        this.dir.copy(this.raycaster.ray.origin).sub(this.hit).normalize();
        this.hit.addScaledVector(this.dir, GAZE.lookDistance);
        // direction head → point, in m_7's own frame
        this.dir.copy(this.hit).sub(this.headPos).applyQuaternion(this.charQInv);
        targetYaw = THREE.MathUtils.clamp(Math.atan2(this.dir.x, this.dir.z), -maxYaw, maxYaw);
        targetPitch = THREE.MathUtils.clamp(
          Math.atan2(this.dir.y, Math.hypot(this.dir.x, this.dir.z)),
          -maxPitch,
          maxPitch
        );
      }
    }

    // ease (frame-rate independent) — the slight, natural lag
    const rate = reducedMotion ? GAZE.reducedMotionEaseRate : GAZE.easeRate;
    const k = 1 - Math.exp(-rate * dt);
    this.yaw += (targetYaw - this.yaw) * k;
    this.pitch += (targetPitch - this.pitch) * k;

    const yaw = this.yaw * weight;
    const pitch = this.pitch * weight;
    if (Math.abs(yaw) < 1e-4 && Math.abs(pitch) < 1e-4) return;

    // full look rotation in m_7's frame, then shared out along the chain
    this.dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.look.setFromUnitVectors(FORWARD, this.dir);

    for (const { bone, share } of this.bones) {
      // this bone's slice, expressed in world space: charQ · part · charQ⁻¹
      this.part.copy(this.identity).slerp(this.look, share);
      this.world.copy(this.charQ).multiply(this.part).multiply(this.charQInv);
      // additive on top of the clip pose: local' = P⁻¹ · world · P · local
      bone.parent!.updateWorldMatrix(true, false);
      bone.parent!.getWorldQuaternion(this.parentQ);
      this.parentQInv.copy(this.parentQ).invert();
      bone.quaternion.premultiply(this.parentQ).premultiply(this.world).premultiply(this.parentQInv);
    }
  }
}
