import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
import { vars, Entity, RawComponent } from "@openrock/entity-dsl";

// One cube entity that can look like any block in the generated appearance table (src/build/blockAppearance.js): the
// synced property `ghost_tex` picks the block's side/top/bottom textures, `ghost_kind` picks build (small, light blue, translucent) or mine (slightly large,
// red, translucent). Visible to every player - see build/ghostBlocks.js for the limits.
const V = vars();
export default (
    <Entity identifier="{{ns}}:ghost_block"
        formatVersion="1.21.10"
        properties={{
            "{{ns}}:ghost_kind": { type: "int", range: [0, 1], default: 1, client_sync: true },
            "{{ns}}:ghost_tex": { type: "int", range: [0, V.ghostBlockCount - 1], default: 0, client_sync: true },
        }}
        clientFormatVersion="1.10.0"
        materials={{ default: "entity_alphablend" }}
        textures={V.ghostTextures}
        geometry={{ default: "geometry.{{ns}}_ghost_cube" }}
        renderControllers={["controller.render.{{ns}}_ghost_block"]}
        clientScripts={{ scale: "query.property('{{ns}}:ghost_kind') == 0 ? 1.02 : 0.9" }}>
        <RawComponent type="minecraft:type_family" value={{ family: ["{{ns}}_ghost", "inanimate"] }} />
        <RawComponent type="minecraft:collision_box" value={{ width: 0.01, height: 0.01 }} />
        <RawComponent type="minecraft:physics" value={{ has_gravity: false, has_collision: false }} />
        <RawComponent type="minecraft:pushable" value={{ is_pushable: false, is_pushable_by_piston: false }} />
        <RawComponent type="minecraft:health" value={{ value: 1000000, max: 1000000 }} />
        <RawComponent type="minecraft:damage_sensor" value={{ triggers: { deals_damage: false } }} />
        <RawComponent type="minecraft:knockback_resistance" value={{ value: 1 }} />
    </Entity>
);
