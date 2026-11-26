# models-src

Original (unoptimized) GLB exports, kept out of `public/` so they never ship.

The copies in `public/` are optimized for the web with gltf-transform:

```
npx @gltf-transform/cli weld     models-src/<name>.glb /tmp/<name>-weld.glb
npx @gltf-transform/cli simplify /tmp/<name>-weld.glb  /tmp/<name>-simp.glb --ratio 0.2 --error 0.0008
npx @gltf-transform/cli quantize /tmp/<name>-simp.glb  public/<name>.glb
```

- `weld + simplify` cut triangle counts (buggy 845k → 278k, hxkeysair 295k → 125k)
  while preserving every node/mesh name — the animation and material code
  looks parts up by name, so never use `optimize`/`join`/`flatten`, which
  merge nodes.
- `quantize` (KHR_mesh_quantization) halves buffer sizes; three's GLTFLoader
  supports it natively, no decoder needed.

Re-run this pipeline whenever a source model is re-exported.

### hxever

From the repository root, repack the mascot with:

```sh
python3 tools/pack-hero-glb.py web/models-src/m_7.glb web/public/m_7-web-v3.glb
```

The packer retains the skin, texture, and five website clips. It offsets the
upper collar seam on this export to give it clearance over the jacket.
Held channels retain their start and end times and collapse only when every
component remains within `1e-6` of its first sample. When publishing a new
model, use a new filename and update `MASCOT_MODEL_URL` in `src/m7/config.ts`
so the site's immutable asset cache serves the new version.
