# Camera modes: RTS command mode and Build mode

Both modes take the camera away from the player and share one safety core, `ui/camera/cameraSession.js`:
a **body double** holds a verified copy of the player's inventory, a serialized backup sits in a player dynamic
property, and every way out (exit item, relog, respawn, death, dimension change, `/reload`) returns the player to
their body with their items. Exit hooks (`registerRtsExitHook`, `registerBuildExitHook`) run on every one of those
paths. Only one camera mode can be active per player.

The player's body **stays where it is**. A chunk anchor (`ui/camera/chunkAnchor.js`) keeps the camera's chunks loaded:
an invisible `<ns>:camera_anchor` entity with `minecraft:tick_world` follows the camera (rule `cameraChunkMode`:
`"anchor"` default, `"teleport"` for the old behaviour of teleporting the invisible player under the camera).

## RTS command mode (`ui/rts.js`)

- **Cursor:** the head still turns freely. Pitch (-90..90) maps to screen height, yaw (relative to entry) maps to screen
  width and wraps (`ui/camera/screenCursor.js`). A fixed-FOV camera turns that screen point into a ray for the block /
  entity under it.
- **Selection:** a set of characters plus squads (`ui/camera/rtsSelection.js`). The Select item is two clicks: first use
  drops corner A (a rectangle outline and hover highlights follow the cursor), second use adds everyone inside to the
  selection. Using Select on one of your own characters toggles her; sneak + use clears.
- **Orders** (`rtsMove`, `rtsAttack`, `rtsSurround`, `rtsSummonHere`, formations) act only on the selection.
- **Feedback:** particles per player (`ui/camera/rtsFx.js`): cursor look depends on the held item's action
  (`registerRtsActionFx(itemTypeId, action)`), selection rings, hover rings, ground rectangle.
- **HUD cursor (optional):** rule `rtsHudCursor` draws the cursor sprite and selection rectangle as a *fast HUD*
  (MinUI `<hud fast>` with `<float>`/`<box>`, see MinUI docs). Off by default until spike S3 passes.

## Build mode (`build/`)

A free-fly camera (rotation = the player's own facing, WASD relative to it, jump/sneak up/down) plus selection tools that
produce a **schematic**: block cells to build, block cells to mine, and chest markers. No waifu logic yet.

`buildAction(player, action)`: `rect`, `circle`, `sphere` (two clicks each), `extendPlus`, `extendMinus` (along the axis you
look along), `mine`, `build` (+ `setBuildBlock`), `erase`, `markInput`, `markOutput`, `clearSelection`, `save`.
Claude Waifus wires them to hotbar items in `PATCHES/scripts/buildControls.js` (sneak + use = the tool's alternate).

### Persistence (all through MCLite)

`build/schematicStore.js` never touches dynamic properties directly; it is given the MCLite API:

| piece | MCLite feature |
|---|---|
| header (name, status, visibility, counts, timestamps) | atomic A/B `schematic` record + world mirror |
| body (the encoded block plan, any size) | `chunkedRecord` (`schematicBody`): parts first, manifest last, previous generation kept |
| per-player list | `perOwnerIndex` summaries (listing never loads a body) |
| id -> owner | `idRegistry` |

Lifecycle: `active` -> `complete()` -> `archived` (hidden); `trash()` -> `trashed` (restorable); `purge(id, {confirmed:true})`
deletes for good and refuses without the confirmation; `sweep()` purges archived/trashed items older than the rule
`buildArchiveDays` (default 30). The plan autosaves every 30 s and on every exit path. Schematics can be toggled visible
(ghost-block particles, `schematicOverlay.js`) outside Build mode.

## In-game spikes

Run `/scriptevent <ns>:spike <name>`; each prints what it found to chat.

| spike | question | fallback if it fails |
|---|---|---|
| `fov` | does the camera API let us set the FOV? | assumed FOV in `DEFAULT_CURSOR_CONFIG`, calibration via `screen` |
| `anchor [distance]` | does a `tick_world` entity keep a far chunk loaded? | `cameraChunkMode: "teleport"` |
| `hud [seconds]` / `screen <w> <h>` | does the fast HUD draw and track? calibrate GUI size | keep the particle cursor (`rtsHudCursor: false`) |
| `hold` | which use events fire for the held item | two-click select needs only `itemUse` |

## Checking it in-game

1. `anchor` spike, then enter Command mode and pan far away: terrain keeps rendering and mobs keep ticking.
2. Cursor follows where you look, wraps at the screen edge; Select twice makes a box, highlighted waifus join the selection; orders move only them.
3. `hud` spike (then `rtsHudCursor: true`): a sprite follows the cursor.
4. Build mode: fly, make a rectangle, plan blocks, mine, mark chests, exit; relog; reopen from the Codex > Schematics.
5. Finish -> Archived; Delete -> Trash -> Delete forever (two confirmations); Show toggles ghost blocks outside Build mode.
6. Leave each mode by item, by dying, by relogging and by `/reload`: inventory and position come back every time.
