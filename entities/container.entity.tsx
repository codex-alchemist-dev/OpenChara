import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
import { Entity, ComponentGroup, Event, RawComponent } from "@openrock/entity-dsl";

export default (
    <Entity identifier="{{ns}}:container"
        formatVersion="1.21.10"
        clientFormatVersion="1.10.0"
        materials={{"default":"entity_alphatest"}}
        textures={{"default":"textures/entity/oc_container"}}
        geometry={{"default":"geometry.oc_container"}}
        renderControllers={["controller.render.default"]}>
        <RawComponent type="minecraft:type_family" value={{"family":["{{ns}}_container","inanimate"]}} />
        <RawComponent type="minecraft:collision_box" value={{"width":0.6,"height":0.6}} />
        <RawComponent type="minecraft:physics" value={{"has_gravity":false,"has_collision":false}} />
        <RawComponent type="minecraft:pushable" value={{"is_pushable":false,"is_pushable_by_piston":false}} />
        <RawComponent type="minecraft:health" value={{"value":1000000,"max":1000000}} />
        <RawComponent type="minecraft:damage_sensor" value={{"triggers":{"deals_damage":false}}} />
        <RawComponent type="minecraft:knockback_resistance" value={{"value":1}} />
        <RawComponent type="minecraft:nameable" value={{"always_show":true,"allow_name_tag_renaming":false}} />
        <RawComponent type="minecraft:inventory" value={{"container_type":"container","inventory_size":27,"private":false}} />
        <RawComponent type="minecraft:persistent" value={{}} />
        <RawComponent type="minecraft:conditional_bandwidth_optimization" value={{}} />
    </Entity>
);
