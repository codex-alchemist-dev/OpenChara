# Cutscenes in OpenChara

OpenChara ships `startCinema()` - the OpenRock cutscene runtime (`@openrock/cinema`) and FMBE display runtime (`@openrock/fmbe`) with this engine's policy filled in. Language and runtime reference: OpenRock `docs/cinema.md` and `docs/fmbe.md`.

## In a project

1. Put `*.cinema` files in a folder and `*.fmbe` scenes in another; declare them in `openrock.mod.json`:
   `"content": { "cinemaDsl": "cinema", "fmbeDsl": "fmbe" }`
2. Hand the compiled content to the engine:

```js
import { startCinema } from "@openchara/core";
import { CUTSCENES } from "@openrock/virtual/openrock-cinema-data";
import { SCENES } from "@openrock/virtual/openrock-fmbe-data";

export const cinema = startCinema({ cutscenes: CUTSCENES, scenes: SCENES, functions: { aoe_wave: (env, players) => {} } });
cinema.play("showcase", [player]);
```

(Claude Waifus does this in `PATCHES/scripts/cinema.js`, with `cinema/showcase.cinema` and `fmbe/shrine.fmbe`.)

## What the engine adds

- **Seen markers and flags** (`mark_seen`, `set_flag`) are stored per player through MCLite's record layer (`cinemaFlags.js`), never raw dynamic properties. `cinema.hasSeen(player, id)` / `cinema.hasFlag(player, name)`.
- **Skipping**: hold jump for 1.5 s (an action-bar hint appears), or `/scriptevent <ns>:cinema skip`. Also `play <id>`, `stop`, `list`.
- **Relative coordinates**: `(~4, ~, ~)` in a `.cinema` file is 4 blocks east of where the player stood when it started, so a cutscene works anywhere.
- Optional UI hooks for letterbox bars, screen overlays and actor speech: pass `hooks: { letterbox, screenShow, screenHide, say }`. Without them those verbs warn once and the cutscene continues.

## Not verified in-game

Whether jump still reads while input is locked (the scriptevent skip always works), how the free camera and its easing look, and everything listed under "Honest limits" in OpenRock `docs/fmbe.md`.
