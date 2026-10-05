import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
import { Entity, ComponentGroup, Event, RawComponent } from "@openrock/entity-dsl";

export default (
    <Entity identifier="{{ns}}:rts_body"
        formatVersion="1.21.10"
        clientFormatVersion="1.10.0"
        materials={{"default":"entity_alphatest"}}
        textures={{"default":"textures/entity/steve"}}
        geometry={{"default":"geometry.humanoid.custom"}}
        renderControllers={["controller.render.default"]}>
        <RawComponent type="minecraft:type_family" value={{"family":["{{ns}}_rts_body","inanimate"]}} />
        <RawComponent type="minecraft:collision_box" value={{"width":0.6,"height":1.8}} />
        <RawComponent type="minecraft:physics" value={{"has_gravity":true,"has_collision":true}} />
        <RawComponent type="minecraft:pushable" value={{"is_pushable":false,"is_pushable_by_piston":false}} />
        <RawComponent type="minecraft:health" value={{"value":20,"max":20}} />
        <RawComponent type="minecraft:damage_sensor" value={{"triggers":{"deals_damage":false}}} />
        <RawComponent type="minecraft:knockback_resistance" value={{"value":1}} />
        <RawComponent type="minecraft:nameable" value={{"always_show":true,"allow_name_tag_renaming":false}} />
        <RawComponent type="minecraft:inventory" value={{"container_type":"inventory","inventory_size":42,"private":true}} />
        <RawComponent type="minecraft:persistent" value={{}} />
    </Entity>
);
