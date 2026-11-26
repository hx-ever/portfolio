import * as THREE from "three";
import {
  ANCHOR_BONE,
  ARM_RELAX_WEIGHT,
  CLIPS,
  CROSSFADE_S,
  FRAMING_SCALE,
  LOCKED_ROOT_BONES,
  LOOPS,
  PRIORITY,
  QUEUED_START_DELAY_MS,
  type M7State,
} from "./config";

type ChangeListener = (next: M7State, prev: M7State) => void;
export type RequestResult = "started" | "queued" | "ignored";

const STATES: M7State[] = ["ENTRANCE", "IDLE", "BORED", "GREETING", "DANCE"];
const ONE_SHOT: Partial<Record<M7State, true>> = { GREETING: true, DANCE: true };
/** Framing changes complete within one crossfade, whatever their size. */
const FRAMING_RATE =
  Math.max(...STATES.map((s) => Math.abs(1 - FRAMING_SCALE[s]))) / CROSSFADE_S || 1;

/** Smoothly step `from` toward `to` at `rate` units per second. */
const approach = (from: number, to: number, rate: number, dt: number) => {
  const step = rate * dt;
  return Math.abs(to - from) <= step ? to : from + Math.sign(to - from) * step;
};

/**
 * The single owner of m_7's AnimationMixer. Every clip change — walk-in,
 * idle, boredom, greeting, the Konami dance — goes through `request()`,
 * which applies one priority table and one crossfade, so behaviours can't
 * fight over the rig. It also owns everything that depends on the state:
 *
 *  - root lock: "root" translation is stripped from every clip, and while a
 *    non-idle clip plays the hips are pinned (horizontally) to where they
 *    sat in Idle, so m_7 never drifts off his resting spot;
 *  - eased transitions for the relaxed-arm override and the framing scale.
 *
 * No React in here: HeroCharacter constructs it and drives `update()` from
 * its render loop (so it pauses with the loop when m_7 is off-screen).
 */
export class M7StateMachine {
  private readonly clips = new Map<M7State, THREE.AnimationClip>();
  private readonly actions = new Map<M7State, THREE.AnimationAction>();
  private readonly anchor: THREE.Object3D | null;
  private readonly listeners = new Set<ChangeListener>();

  private state: M7State = "IDLE";
  private queued: M7State | null = null;
  private stateTime = 0; // mixer seconds in the current state
  private playFor = Infinity; // one-shots: when to head back to IDLE
  private idleSince = 0; // performance.now() when IDLE was entered
  private lockFrom: THREE.Vector3 | null = null; // hips (scene-local) in Idle
  private readonly tmp = new THREE.Vector3();

  /** Eased weights, read by HeroCharacter each frame. */
  armWeight = 1;
  framing = 1;

  constructor(
    private readonly mixer: THREE.AnimationMixer,
    animations: THREE.AnimationClip[],
    private readonly scene: THREE.Object3D,
    /** Model height in the in-place wrapper's units (feet at -height/2). */
    private readonly height: number,
    private readonly reducedMotion: () => boolean
  ) {
    for (const s of STATES) {
      const source = animations.find((a) => a.name === CLIPS[s]);
      if (source) this.clips.set(s, source);
    }
    this.anchor = scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(ANCHOR_BONE)) ?? null;
  }

  has(state: M7State) {
    return this.clips.has(state);
  }

  getState() {
    return this.state;
  }

  isQueued(state: M7State) {
    return this.queued === state;
  }

  onChange(fn: ChangeListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Begin in ENTRANCE (walk-in) or straight in IDLE — no crossfade. */
  start(initial: "ENTRANCE" | "IDLE") {
    const action = this.actionFor(initial) ?? this.actionFor("IDLE");
    action?.reset().setEffectiveWeight(1).play();
    this.state = initial;
    this.stateTime = 0;
    this.idleSince = performance.now();
    this.armWeight = ARM_RELAX_WEIGHT[initial];
    this.framing = FRAMING_SCALE[initial];
  }

  /** The walk-in reached its spot: blend Walk → Idle. Still ENTRANCE (he
   *  turns to face the camera next), so nothing can interrupt yet. */
  entranceArrived() {
    if (this.state !== "ENTRANCE") return;
    const idle = this.actionFor("IDLE");
    if (idle) this.fadeTo(idle);
  }

  /** The walk-in has fully settled facing the camera: now IDLE. */
  entranceComplete() {
    if (this.state !== "ENTRANCE") return;
    this.setState("IDLE");
  }

  /**
   * Ask for a state. ENTRANCE queues everything; otherwise a request wins if
   * it outranks the current state (anything beats IDLE). Lower/equal
   * priority requests are ignored. A request landing in IDLE within
   * QUEUED_START_DELAY_MS of arriving there is queued for that beat.
   */
  request(next: M7State): RequestResult {
    if (next === this.state || next === "ENTRANCE" || next === "IDLE") return "ignored";
    if (!this.has(next)) return "ignored";
    if (this.state === "ENTRANCE" || (this.state === "IDLE" && !this.idleLongEnough())) {
      if (!this.queued || PRIORITY[next] > PRIORITY[this.queued]) this.queued = next;
      return "queued";
    }
    if (this.state !== "IDLE" && PRIORITY[next] <= PRIORITY[this.state]) return "ignored";
    this.enter(next);
    return "started";
  }

  update(dt: number) {
    this.stateTime += dt;

    // one-shots head home just in time for the crossfade to finish at the end
    if (ONE_SHOT[this.state] && this.stateTime >= this.playFor - CROSSFADE_S) {
      this.returnToIdle();
    }

    if (this.state === "IDLE" && this.queued && this.idleLongEnough()) {
      const q = this.queued;
      this.queued = null;
      this.enter(q);
    }

    // eased per-state weights
    this.armWeight = approach(this.armWeight, ARM_RELAX_WEIGHT[this.state], 1 / CROSSFADE_S, dt);
    this.framing = approach(this.framing, FRAMING_SCALE[this.state], FRAMING_RATE, dt);

    // the hips lock is released once he's fully back in Idle
    if (this.state === "IDLE" && this.lockFrom && this.stateTime >= CROSSFADE_S) {
      this.lockFrom = null;
    }
  }

  /**
   * Call right after mixer.update(): writes the in-place offset (hips pinned
   * to their Idle X/Z) and the feet-pivoted framing scale onto `wrapper`, an
   * identity group around the model.
   */
  applyInPlace(wrapper: THREE.Object3D | null) {
    if (!wrapper) return;
    const s = this.framing;
    wrapper.scale.setScalar(s);
    let dx = 0;
    let dz = 0;
    if (this.lockFrom && this.anchor) {
      const p = this.anchorLocal(this.tmp);
      dx = -(p.x - this.lockFrom.x) * this.scene.scale.x * s;
      dz = -(p.z - this.lockFrom.z) * this.scene.scale.z * s;
    }
    wrapper.position.set(dx, -(this.height / 2) * (1 - s), dz);
  }

  /** Stop everything (unmount). Listeners hear a final change to IDLE. */
  dispose() {
    this.actions.forEach((a) => a.stop());
    if (this.state !== "IDLE") this.setState("IDLE");
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- private

  private actionFor(state: M7State) {
    const existing = this.actions.get(state);
    if (existing) return existing;
    const source = this.clips.get(state);
    if (!source) return undefined;

    const tracks = source.tracks.filter((track) => {
      const dot = track.name.lastIndexOf(".");
      return !(track.name.slice(dot + 1) === "position" && LOCKED_ROOT_BONES.includes(track.name.slice(0, dot)));
    });
    // The mixer only reads the keyframes. Share those arrays and bind each
    // clip to the rig when it first plays, including the optional reactions.
    const clip = new THREE.AnimationClip(source.name, source.duration, tracks, source.blendMode);
    const action = this.mixer.clipAction(clip);
    action.clampWhenFinished = true;
    this.actions.set(state, action);
    return action;
  }

  private idleLongEnough() {
    return performance.now() - this.idleSince >= QUEUED_START_DELAY_MS;
  }

  private anchorLocal(out: THREE.Vector3) {
    this.anchor!.updateWorldMatrix(true, false);
    return this.scene.worldToLocal(this.anchor!.getWorldPosition(out));
  }

  private enter(next: M7State) {
    const action = this.actionFor(next)!;
    // pin the hips where they are in Idle; chained states keep that origin
    if (!this.lockFrom && this.anchor) this.lockFrom = this.anchorLocal(new THREE.Vector3());

    if (ONE_SHOT[next]) {
      const loops =
        next === "DANCE" && this.reducedMotion()
          ? LOOPS.DANCE_REDUCED_MOTION
          : LOOPS[next as "GREETING" | "DANCE"];
      action.setLoop(THREE.LoopRepeat, loops);
      this.playFor = action.getClip().duration * loops;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      this.playFor = Infinity;
    }
    this.fadeTo(action);
    this.setState(next);
  }

  private returnToIdle() {
    const idle = this.actionFor("IDLE");
    if (idle) {
      idle.setLoop(THREE.LoopRepeat, Infinity);
      this.fadeTo(idle);
    }
    this.playFor = Infinity;
    this.setState("IDLE");
  }

  /** The one crossfade every transition uses. */
  private fadeTo(next: THREE.AnimationAction) {
    this.actions.forEach((a) => {
      if (a !== next && a.isRunning()) a.fadeOut(CROSSFADE_S);
    });
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(CROSSFADE_S).play();
  }

  private setState(next: M7State) {
    const prev = this.state;
    this.state = next;
    this.stateTime = 0;
    if (next === "IDLE") this.idleSince = performance.now();
    this.listeners.forEach((fn) => fn(next, prev));
  }
}
