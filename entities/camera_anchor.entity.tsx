import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
import { Entity, RawComponent } from "@openrock/entity-dsl";

// Invisible chunk loader that follows a camera mode's camera (see ui/camera/chunkAnchor.js). `minecraft:tick_world`
// keeps the chunks around the entity loaded and ticking, so the player's own body can stay where it is.
// Spike S4 (/scriptevent <ns>:spike anchor) confirms radius / distance_to_players behaviour in-game.
export default (
    <Entity identifier="{{ns}}:camera_anchor"
        formatVersion="1.21.10"
        clientFormatVersion="1.10.0"
        materials={{ default: "entity_alphatest" }}
        textures={{ default: "textures/entity/steve" }}
        geometry={{ default: "geometry.humanoid.custom" }}
        renderControllers={["controller.render.default"]}>
        <RawComponent type="minecraft:type_family" value={{ family: ["{{ns}}_camera_anchor", "inanimate"] }} />
        <RawComponent type="minecraft:collision_box" value={{ width: 0.1, height: 0.1 }} />
        <RawComponent type="minecraft:physics" value={{ has_gravity: false, has_collision: false }} />
        <RawComponent type="minecraft:pushable" value={{ is_pushable: false, is_pushable_by_piston: false }} />
        <RawComponent type="minecraft:health" value={{ value: 1000000, max: 1000000 }} />
        <RawComponent type="minecraft:damage_sensor" value={{ triggers: { deals_damage: false } }} />
        <RawComponent type="minecraft:knockback_resistance" value={{ value: 1 }} />
        <RawComponent type="minecraft:tick_world" value={{ radius: 4, never_despawn: true, distance_to_players: 0 }} />
        <RawComponent type="minecraft:persistent" value={{}} />
    </Entity>
);
