# Looks and forms

How a character looks and fights is **data on her species** (`characters/<id>.json`), decided at runtime from rules. Every character is the same entity; nothing here creates entities per character.

## The pieces

| piece | what it is | where |
|---|---|---|
| **skin** | one texture (+ optional glow). `default` is `texture`/`emissiveTexture`; every other skin is named in `skins`. | `characters/<id>.json` |
| **skin rule** | `{ skin, when, priority }`: show that skin when `when` holds. Highest priority wins, ties go to the rule written first. | `skinRules` |
| **form** | a named combat identity: its own **class** (stats, abilities, skill tree), base skin, required **weapons**, and **tactics** the squad AI scores. | `forms`, `defaultForm`, `formPolicy` |
| **overlay** | an alpha layer drawn over the skin whose level follows a number (dirt, wetness, damage...). Textures are per rig. | `overlays/<id>.json` |
| **condition** | a named test usable in `when`. Builtins below; a project registers its own. | `registerSkinCondition` |

Resolution order for the skin: matching rules by priority, else the current form's `skin`, else `default`.

## Skins and rules

```json
"skins": { "night": {"texture": "textures/entity/march7_n"}, "hunt": {...}, "hunt_night": {...} },
"skinRules": [
  { "skin": "hunt_night", "priority": 20, "when": { "form": "hunt", "time": "night" } },
  { "skin": "night",      "priority": 10, "when": { "time": "night" } },
  { "skin": "freckled",   "priority": 5,  "when": { "random": { "name": "freckles", "of": 4, "is": [0, 1] } } }
]
```
A `when` is an object whose conditions must **all** hold, plus `all: [..]`, `any: [..]` and `not: {..}` for nesting. Skin names: lowercase first letter, letters/digits/underscores. Any number of skins; the build gives each a global `skin_id` and one render controller covers them all.

### Builtin conditions
`form`, `time` (day/night/dawn/dusk), `weather`, `dimension`, `biome` (substring), `wet` (dry/damp/wet/soaked or `{gte}`), `inWater`, `underwater`, `swimming`, `sneaking`, `sitting`, `sleeping`, `riding`, `combat`, `health` (healthy/wounded/critical or `{lt}`), `dirt` (`{gte}`), `light`, `holding` (weapon category), `armor` (slot or `{chest:false}`), `level`, `relationship`, `order`, `squad`, `date` (`{from:"12-24",to:"12-26"}`, wraps the year: holidays, seasons), `random`.
Tactical ones (forms only, filled in by the squad AI): `enemies`, `nearestEnemy`, `targetDistance`, `alliesWounded`, `alliesDown`, `squadSize`, `healer`, `posture`, `outnumbered`, `selfHealth`. Numeric conditions take a number (equals) or `{eq,gt,gte,lt,lte}`.

### Your own conditions
```js
import { registerSkinCondition, registerLookContextProvider } from "@openchara/core";
registerLookContextProvider((ctx, { record }) => ({ moon: world.getMoonPhase(), relationship: record.relationships?.love?.level }));
registerSkinCondition("moonPhase", (arg, ctx) => ctx.moon === arg);   // now usable: { "moonPhase": 4 }
```
An unknown condition name is false and logged once, never a crash.

### Random variation ("minute differences")
`random: { name, of, is, period? }` is **not** random per tick: it is a hash of her permanent seed (`record.look.seed`), the name and a time bucket, so it is stable across relogs. `period`: `stable` (default, forever), `session`, `hourly`, `daily`, `weekly`, or a number of seconds. Use independent `name`s for independent traits (freckles, hair, outfit).

## Forms (combat identity)

```json
"forms": {
  "hunt":         { "displayName": "The Hunt", "class": "march7_hunt", "skin": "hunt", "weapons": ["sword"],
                    "tactics": [ { "when": {"nearestEnemy": {"lt": 5}}, "score": 2 } ] },
  "preservation": { "class": "frost_marksman", "weapons": ["bow"],
                    "tactics": [ { "when": {"alliesWounded": {"gte": 2}}, "score": 3, "urgent": true } ] }
},
"defaultForm": "preservation",
"formPolicy": { "mode": "tactical", "minDwellSeconds": 8, "stickiness": 0.75, "swapCost": 0.5 }
```
- **Class per form.** `classOf(record)` / `classIdOf(record)` return the form's class; use them instead of `record.class`. A form therefore has its own base stats, positioning (melee/ranged), `defaultAbilities` and **skill tree**. `activeAbilities(record)` gives the current kit (class defaults + abilities granted by unlocked nodes via `node.grantsAbility`). Skill node ids must be unique across a species' form classes (use a prefix); the flat `unlockedSkills` list then keeps each tree's progress separate.
- **Weapon categories** (`weapons`): `sword`, `bow`, `crossbow`, `axe`, `trident`, `mace`, `spear`, `shield`... `registerWeaponCategory(/^mod:katana/, "sword")` for modded items.
- **Modes.** `tactical` (default): the squad AI scores every form's `tactics` against the situation each cycle. `weapon`: whatever she holds decides. `manual`: only `setForm` moves her.
- **Scoring.** Sum of the `score` of tactics whose `when` holds, `+stickiness` for the current form (no flapping), `-swapCost` when the form needs a weapon she is not holding. A form whose weapon she cannot get is not a candidate. The current form is kept for `minDwellSeconds` unless a matching tactic is `urgent`.
- **Applying it.** `evaluateSquadForms` runs from the squad coordination loop (members, hostiles, posture); characters outside a squad are evaluated once a second. Choosing a form equips that form's weapon from her hand/inventory, stores `record.form`, re-asserts melee/ranged behavior and refreshes her skin at once. If something else puts a different weapon in her hand she **follows it**: the form matching the weapon wins (so "sword = Hunt, bow = Preservation" holds for player-initiated changes too).
- **Events.** `on("formChanged", { owner, characterId, from, to, reason, record })`.

## Overlays (wetness, dirt, damage...)
```json
// overlays/dirt.json
{ "id": "dirt", "levels": { "*": ["textures/oc/dirt1","textures/oc/dirt2"], "waifuB": ["textures/oc/dirtB1","textures/oc/dirtB2"] },
  "drive": { "source": "dirt", "thresholds": [0.3, 0.7] } }
```
Textures are per rig (`"*"` is the fallback; a rig without textures shows nothing). `drive.source` is `dirt`, `wetness`, `damage` (1 - health) or any numeric look-context field; the level is the number of thresholds reached. The build adds one alpha layer and an `ov_<id>` entity property per overlay.

Wetness is simulated (rises in water/rain, dries; faster in the Nether). Dirt is added by the project: `addDirt(characterId, 0.1)` from its own events (combat, mining, mud) and washes off while she is wet. Both feed skin conditions (`wet`, `dirt`) and overlays.

## Runtime map (engine `look/`)
`skinRules.js` (registry, matching, resolution) · `builtinConditions.js` · `variation.js` · `weapons.js` · `formSelect.js` (pure scoring) · `forms.js` (record API) · `formController.js` (squad/solo evaluation, weapon swap) · `lookContext.js` (gathers the facts) · `lookState.js` (wetness/dirt/seed) · `lookSystem.js` (once-a-second driver) · `appearanceModel.js` (pure wet/dirt/overlay math). Build side: `src/build/species.js` (tables, render controller) and `validateLooks.js` (errors name the file).

## Limits
- Skin changes are held for 2 s so a sneak toggle cannot flicker her. Form changes are held by `minDwellSeconds`.
- Every skin is a texture; combinations multiply (form x time x wet...). Prefer **overlays** for continuous or independent traits, and rules with priorities for the few combined looks that need a full texture.
- Skins and overlays need textures that match the rig's UV layout.
