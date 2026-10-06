"use strict";

// FMBE ("Fox MBE") display entities - the Bedrock community technique for showing ANY block or item with its real
// model and texture, using only vanilla content: a vanilla `minecraft:fox` holds the block's item in its main hand,
// and client animations (`playanimation` with Molang variables) shrink/scale/move the fox so the held item looks like
// a block floating at the chosen spot. Source (compressed 3-command version): the Bedrock Wiki,
// https://wiki.bedrock.dev/commands/display-entities - the command strings below are copied from it.
//
// Pure (no game imports): the strings are built here and run with `entity.runCommand(...)` by ghostEntities.js.
//   scale   overall size (1 = a full block)
//   xpos/ypos/zpos   offset in 1/16 block units (16 = one block) from the fox's position
// Not covered by the wiki and therefore calibrated in-game: where the block sits relative to the fox's position.

const NUM = n => (Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : "0");

/** The three commands, to be run as the fox (`@s`), in this order. */
function fmbeCommands({ scale = 1, xpos = 0, ypos = 0, zpos = 0 } = {}) {
    return [
        `playanimation @s animation.player.sleeping none 0 "" controller.animation.fox.move`,
        `playanimation @s animation.creeper.swelling none 0 "v.scale=${NUM(scale)};v.adscale=math.sqrt(v.scale);v.adscaled=2.1385*v.adscale;v.xbasepos=0;v.ybasepos=0;v.zbasepos=0;v.xpos=${NUM(xpos)};v.ypos=${NUM(ypos)};v.zpos=${NUM(zpos)};v.xrot=q.life_time*0;v.yrot=q.life_time*0;v.zrot=q.life_time*0;v.swelling_scale1=v.adscaled;v.swelling_scale2=v.adscaled;" wiki.scale`,
        `playanimation @s animation.ender_dragon.neck_head_movement none 0 "v.adjust_xz=8*v.adscaled+v.zbasepos/v.adscaled;v.adjust_y=(-5-v.ybasepos/v.adscaled/v.adscaled)*v.adscaled;v.x=v.xbasepos/v.adscaled;v.y=v.adjust_y;v.z=v.adjust_xz;v.ty=v.y*math.cos(v.xrot)-v.z*math.sin(v.xrot);v.tz=v.y*math.sin(v.xrot)+v.z*math.cos(v.xrot);v.y=v.ty;v.z=v.tz;v.tx=-v.x*math.cos(v.zrot)+v.y*math.sin(v.zrot);v.ty=v.x*math.sin(v.zrot)+v.y*math.cos(v.zrot);v.x=v.tx;v.y=v.ty;v.tx=v.x*math.cos(v.yrot)+v.z*math.sin(v.yrot);v.tz=-v.x*math.sin(v.yrot)+v.z*math.cos(v.yrot);v.x=v.tx;v.z=v.tz;v.head_position_x=v.x+v.xpos/v.adscaled;v.head_position_y=7.48/v.adscale+v.z+v.zpos/v.adscaled;v.head_position_z=v.y-v.ypos/v.adscaled;v.head_rotation_x=90+v.xrot;v.head_rotation_y=v.zrot;v.head_rotation_z=v.yrot;" wiki.posrot`,
    ];
}

/** Fox sounds the displays would otherwise make (from the same wiki page). */
const FOX_SOUNDS = ["spit", "sniff", "sleep", "screech", "hurt", "eat", "death", "bite", "ambient", "aggro"];
const stopSoundCommands = () => FOX_SOUNDS.map(s => `stopsound @a mob.fox.${s}`);

/** Effects that keep a display fox where it is, alive and quiet (a vanilla fox otherwise wanders, sleeps, fights and burns). */
const FMBE_EFFECTS = Object.freeze([
    ["slowness", 255], ["resistance", 255], ["fire_resistance", 0], ["weakness", 255], ["slow_falling", 0],
]);

module.exports = { fmbeCommands, stopSoundCommands, FOX_SOUNDS, FMBE_EFFECTS };
