# Animation, faces and talking (design)

Status: design + first tools. Private use of third-party reference material only (see the project's LICENSES notes); this repo contains **tools and formats, never pack data**.

Goal: every character, whatever her rig, can walk/sit/fight/emote, blink, change expression and **talk with lip-sync**, from one shared library, without per-character animation files.

## 1. Layers

| layer | what | where |
|---|---|---|
| **Skeleton** | the canonical bone vocabulary and, per rig family, which real bone each canonical bone is | `skeletons/<id>.json` (project) |
| **Face kit** | zero-thickness colored planes in front of the head (eyes, lids, brow, mouth, teeth) that any head can carry, plus a 16x16 palette texture | `src/anim/faceKit.js`, `src/anim/palette.js` |
| **Animation sets** | canonical animations + controllers, compiled once per skeleton and gated by `rig_index` | `animations/<set>/` (project), `src/anim/` |
| **Face runtime** | blink, look-at, expression poses, mouth variables, lip-sync track playback | engine `look/` + generated client scripts |
| **Lipsync tool** | audio -> lip-sync track (+ Bedrock timeline animation) | `tools/lipsync.js` |
| **Importers** | reference packs -> our format (never committed to this repo) | `tools/anim-import/` |

## 2. Canonical bones

Body: `root, waist, body, head, rightArm, leftArm, rightLeg, leftLeg, rightItem, leftItem`.
Outer layers (optional, follow their parent): `out_head, out_body, out_rightArm, ...`.
Face (added by the face kit): `face` (parent `head`), `eyeL, eyeR, lidUpperL, lidUpperR, lidLowerL, lidLowerR, brow, mouth, teethTop, teethBottom`.
Extras that rigs may have (physics targets, kept by name): `hair*, bangs, tail*, ears, cape, hat, boobs`.

A **skeleton** maps canonical -> real names. Vanilla humanoid = identity. AC (`geometry.waifuB` family): `head->h3ad, body->b0dy, rightArm->right4rm, leftArm->left4rm, rightLeg->rightL3g, leftLeg->leftL3g, rightItem->rightItem` (AC's normal names are empty child bones for armor/items, so animations must target the scrambled ones).

## 3. The face kit (decoded from Villager News's villager)

All planes sit 0-0.15 px in front of the head's front face, children of a `face` bone under `head`. Numbers are for an 8x8x8 head at origin `[-4, 24, -4]` (eyes +3.5, mouth +1.5 above the bottom: the standard Minecraft face); other heads scale from their cube.

| bone | cube origin / size (px) | pivot |
|---|---|---|
| eyeL / eyeR | `[0.975,26.975,-3.975]` / `[-2.025,26.975,-3.975]`, 1.05 x 1.05 x 0 | eye centers `[+-1.5, 27.5, -3.975]` |
| lidUpperL / R | `[0.9875,28,-4]` / `[-3.0375,28,-4]`, 2.05 x 1.025 x 0 | `[+-2, 29, -4]` (parent `lidUpper` at `[0,29,-4]`) |
| lidLowerL / R | `[0.9875,25.975,-4]` / `[-3.0375,25.975,-4]`, 2.05 x 1.025 x 0 | `[+-2, 26, -4]` |
| brow | `[-3.05,28,-4.15]`, 6.1 x 1 x 1 | `[0, 28, -4.15]` |
| mouth | `[-2,25,-4.025]`, 4 x 1 x 0.025 | `[0, 25.5, -4.0125]` |
| teethTop / teethBottom | `[-2.025,25.525,-4.05]` / `[-2.025,24.975,-4.05]`, 4.05 x 0.5 x 0.05 | `[0, 25.7625, -4.025]` / `[0, 25.2375, -4.025]` |

**Colors come from a palette texture**, not the body skin: every plane's UV points at one pixel of a 16x16 palette (`skin, eye, lid, brow, mouth, inside, teeth, blush`). A second render controller draws only the face bones with the palette (part visibility), so the body texture is untouched and any head works. Palette colors are derived from the character's skin or art (`palette.js`).

**Blink:** scale the lids to close (`lidUpper*` y 2.02 for 0.15 s, random delay 0.5-2.5 s).
**Mouth:** three variables, sampled each frame:
- `v.oc_open` 0, 0.25, 0.5, 0.75, 1 : teethTop moves up and teethBottom down by `open x 0.75` (x2 for chibi/baby proportions); the mouth plane squashes as it opens.
- `v.oc_wide` 0, 0.5, 0.75, 1 : mouth/teeth X scale `0.75 + wide x 0.25`.
- `v.oc_closed` 0/1 : collapses the mouth to a line.
**Expressions:** named poses over `eye*, lid*, brow, mouth` (+ optional head tilt), selected by an integer `cw:expression` entity property; held until changed.

## 4. Lip-sync tracks

A track is a Bedrock timeline animation (no bones) at **24 fps** setting the three mouth variables (and the expression tag once at the start), one per voice clip:

```json
"animation.oc.lip.<clip>": { "animation_length": 2.5, "loop": "hold_on_last_frame",
  "timeline": { "0.0": ["v.oc_open=0;","v.oc_wide=1;","v.oc_closed=1;"], "0.0417": ["v.oc_open=0.5;","v.oc_wide=0.5;","v.oc_closed=0;"] } }
```
`tools/lipsync.js` generates them from audio (any format via ffmpeg): amplitude -> openness, a spectral centroid / band ratio -> width, silence -> closed. The server plays a track with `entity.playAnimation("animation.oc.lip.<clip>")` alongside the sound.

## 5. Animation sets and controllers

A set is a folder with canonical animations (`*.anim.json`, Bedrock animation syntax, canonical bone names), controllers (`*.controller.json`) and `set.json` (id, version, which queries it needs). The compiler emits, **per skeleton**, `animations/oc_<set>_<skeleton>.json` with bone names mapped, and adds to the generated client entity: the animation map, the controllers, and `scripts.animate` entries gated by the rig: `{ "oc_walk_ac": "q.property('cw:rig_index')==3||q.property('cw:rig_index')==4" }`. Controllers read **entity properties** the server sets (sitting, combat, expression, emote, riding...) and standard queries; they never read `q.skin_id` (AC's combat flag) because CW's `cw:skin_id` selects textures. Distance-based LOD (AC turns physics on within 22 blocks of the camera) is part of the controllers.

## 6. Importing reference packs

Reference packs (Actions & Stuff, Villager News) are obfuscated: bone names are a fixed substitution (each letter shifted by 2 in base-36, e.g. `d67l_6q6` = `left_eye`); animation ids, variables and files are random. Importers decode bones, normalize to the canonical vocabulary, rename animations to stable readable ids derived from what triggers them, and write `animations/<set>/`. Imported data lives in the **project repo**, never in OpenChara.

## 7. What each rig needs

- A skeleton map (section 2). AC rigs: the AC map. Vanilla humanoid skins: identity.
- A head anchor (head cube origin/size) so the face kit can be scaled; found automatically from the head cube.
- Optional `face.palette`: `auto` (derive from skin/art) or a texture path.
- Optional `body.scale` (already supported) and extra bones for physics/hair that sets care about.

## 8. Not done yet / open
Expressions library import; Actions & Stuff action catalog and retargeting; controller compiler; client entity animation passthrough in OpenRock; per-character face palette generation in the build; in-game verification of every part.
