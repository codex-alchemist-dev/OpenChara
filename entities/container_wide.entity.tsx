import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
import { Entity, ComponentGroup, Event, RawComponent } from "@openrock/entity-dsl";

export default (
    <Entity identifier="{{ns}}:container_wide"
        formatVersion="1.21.10"
        clientFormatVersion="1.10.0"
        materials={{"default":"entity_alphatest"}}
        textures={{"default":"textures/entity/oc_container"}}
        geometry={{"default":"geometry.oc_container"}}
        renderControllers={["controller.render.default"]}>
        <ComponentGroup name="{{ns}}_container_tamed">
            <RawComponent type="minecraft:is_tamed" value={{}} />
            <RawComponent type="minecraft:is_chested" value={{}} />
            <RawComponent type="minecraft:inventory" value={{"container_type":"horse","inventory_size":441,"private":false,"restrict_to_owner":true}} />
            <RawComponent type="minecraft:equippable" value={{"slots":[{"slot":0,"item":"minecraft:saddle","accepted_items":["minecraft:saddle"]},{"slot":1,"item":"minecraft:apple"},{"slot":2,"item":"minecraft:apple"},{"slot":3,"item":"minecraft:apple"},{"slot":4,"item":"minecraft:apple"},{"slot":5,"item":"minecraft:apple"},{"slot":6,"item":"minecraft:apple"}]}} />
        </ComponentGroup>
        <Event name="{{ns}}:container_tamed" definition={{"add":{"component_groups":["{{ns}}_container_tamed"]}}} />
        <RawComponent type="minecraft:type_family" value={{"family":["{{ns}}_container","inanimate"]}} />
        <RawComponent type="minecraft:collision_box" value={{"width":0.6,"height":0.6}} />
        <RawComponent type="minecraft:physics" value={{"has_gravity":false,"has_collision":false}} />
        <RawComponent type="minecraft:pushable" value={{"is_pushable":false,"is_pushable_by_piston":false}} />
        <RawComponent type="minecraft:health" value={{"value":1000000,"max":1000000}} />
        <RawComponent type="minecraft:damage_sensor" value={{"triggers":{"deals_damage":false}}} />
        <RawComponent type="minecraft:knockback_resistance" value={{"value":1}} />
        <RawComponent type="minecraft:nameable" value={{"always_show":true,"allow_name_tag_renaming":false}} />
        <RawComponent type="minecraft:persistent" value={{}} />
        <RawComponent type="minecraft:conditional_bandwidth_optimization" value={{}} />
        <RawComponent type="minecraft:tameable" value={{"probability":1,"tame_items":["minecraft:bone"],"tame_event":{"event":"{{ns}}:container_tamed","target":"self"}}} />
    </Entity>
);
