import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
import { Entity, ComponentGroup, Event, RawComponent } from "@openrock/entity-dsl";

export default (
    <Entity identifier="{{ns}}:pathfind_anchor"
        formatVersion="1.16.0"
        runtimeIdentifier="minecraft:armor_stand"
        clientFormatVersion="1.10.0"
        materials={{"default":"armor_stand"}}
        textures={{"default":"textures/entity/armor_stand"}}
        geometry={{"default":"geometry.armor_stand"}}
        renderControllers={["controller.render.armor_stand"]}>
        <RawComponent type="minecraft:type_family" value={{"family":["{{ns}}_character","mob","{{ns}}_pathfind_anchor"]}} />
        <RawComponent type="minecraft:collision_box" value={{"width":0.3,"height":0.3}} />
        <RawComponent type="minecraft:physics" value={{"has_gravity":false,"has_collision":false}} />
        <RawComponent type="minecraft:pushable" value={{"is_pushable":false,"is_pushable_by_piston":false}} />
        <RawComponent type="minecraft:health" value={{"value":1000000,"max":1000000}} />
        <RawComponent type="minecraft:damage_sensor" value={{"triggers":{"on_damage":{"filters":{"test":"is_family","subject":"self","value":"{{ns}}_pathfind_anchor"}},"deals_damage":false}}} />
        <RawComponent type="minecraft:conditional_bandwidth_optimization" value={{}} />
    </Entity>
);
