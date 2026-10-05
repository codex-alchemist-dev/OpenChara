import * as OpenRockEntity from "@openrock/entity-dsl/jsx-runtime";
import { vars, Entity, ComponentGroup, Event, RawComponent } from "@openrock/entity-dsl";

// The project's character entity. Visuals and the navigation-slot pool come from the consuming
// mod's characters (see src/build/vars.js).
const V = vars();
const slotGroups = [];
const slotEvents = [];
for (let i = 0; i < V.navigationSlots; i++) {
    slotGroups.push(
        <ComponentGroup name={`{{ns}}:navigating_slot_${i}`}>
            <RawComponent type="minecraft:behavior.follow_mob" value={{
                filters: { test: "has_tag", subject: "other", value: `{{ns}}_anchor_slot_${i}` },
                search_range: 64, stop_distance: 1, speed_multiplier: 1.3,
            }} />
        </ComponentGroup>
    );
    slotEvents.push(
        <Event name={`{{ns}}:navigating_on_slot_${i}`} definition={{ add: { component_groups: [`{{ns}}:navigating_slot_${i}`] } }} />,
        <Event name={`{{ns}}:navigating_off_slot_${i}`} definition={{ remove: { component_groups: [`{{ns}}:navigating_slot_${i}`] } }} />
    );
}

const targetFilters = (withCreeperRule: boolean) => ({
    filters: {
        any_of: [
            withCreeperRule
                ? { all_of: [{ test: "is_family", subject: "other", value: "monster" }, { test: "is_family", subject: "other", operator: "!=", value: "creeper" }] }
                : { test: "is_family", subject: "other", value: "monster" },
            {
                all_of: [
                    { any_of: [{ test: "has_tag", subject: "other", value: "{{ns}}_hunt_target" }, { test: "has_tag", subject: "other", value: "{{ns}}_owner_enemy" }] },
                    { test: "is_family", subject: "other", operator: "!=", value: "player" },
                    { test: "is_family", subject: "other", operator: "!=", value: "{{ns}}_{{char}}" },
                ],
            },
        ],
    },
    max_dist: 16,
});

export default (
    <Entity identifier="{{ns}}:{{char}}"
        formatVersion="1.21.10"
        properties={{ "{{ns}}:species_index": { type: "int", range: [0, V.maxCharacterIndex], default: 0, client_sync: true } }}
        clientFormatVersion="1.16.0"
        materials={{ default: V.characterMaterial }}
        textures={V.characterTextures}
        geometry={{ default: V.characterGeometry }}
        renderControllers={["controller.render.{{ns}}_{{char}}"]}
        enableAttachables={true}
        hideArmor={false}>
        <ComponentGroup name="{{ns}}:despawn">
            <RawComponent type="minecraft:instant_despawn" value={{}} />
        </ComponentGroup>
        <ComponentGroup name="{{ns}}:wander">
            <RawComponent type="minecraft:behavior.random_stroll" value={{ priority: 6, speed_multiplier: 0.8 }} />
        </ComponentGroup>
        <ComponentGroup name="{{ns}}:melee">
            <RawComponent type="minecraft:behavior.nearest_attackable_target" value={{ priority: 2, reselect_targets: true, within_radius: 16, must_see: true, entity_types: [targetFilters(true)] }} />
            <RawComponent type="minecraft:behavior.melee_attack" value={{ priority: 3, speed_multiplier: 1.2, track_target: true }} />
        </ComponentGroup>
        <ComponentGroup name="{{ns}}:ranged">
            <RawComponent type="minecraft:behavior.nearest_attackable_target" value={{ priority: 2, reselect_targets: true, within_radius: 16, must_see: true, entity_types: [targetFilters(false)] }} />
            <RawComponent type="minecraft:shooter" value={{ def: "minecraft:arrow" }} />
            <RawComponent type="minecraft:behavior.ranged_attack" value={{ priority: 3, attack_interval_min: 1.2, attack_interval_max: 2.2, attack_radius: 15 }} />
        </ComponentGroup>
        {slotGroups}
        <Event name="{{ns}}:wander_on" definition={{ add: { component_groups: ["{{ns}}:wander"] } }} />
        <Event name="{{ns}}:wander_off" definition={{ remove: { component_groups: ["{{ns}}:wander"] } }} />
        <Event name="minecraft:entity_spawned" definition={{ add: { component_groups: ["{{ns}}:wander", "{{ns}}:melee"] } }} />
        <Event name="{{ns}}:role_melee" definition={{ add: { component_groups: ["{{ns}}:melee"] }, remove: { component_groups: ["{{ns}}:ranged"] } }} />
        <Event name="{{ns}}:role_ranged" definition={{ add: { component_groups: ["{{ns}}:ranged"] }, remove: { component_groups: ["{{ns}}:melee"] } }} />
        {slotEvents}
        <RawComponent type="minecraft:type_family" value={{ family: ["{{ns}}_{{char}}"] }} />
        <RawComponent type="minecraft:collision_box" value={{ width: 0.6, height: 1.9 }} />
        <RawComponent type="minecraft:health" value={{ value: 40, max: 40 }} />
        <RawComponent type="minecraft:physics" value={{}} />
        <RawComponent type="minecraft:pushable" value={{ is_pushable: true, is_pushable_by_piston: true }} />
        <RawComponent type="minecraft:nameable" value={{}} />
        <RawComponent type="minecraft:damage_sensor" value={{ triggers: { cause: "fall", deals_damage: false } }} />
        <RawComponent type="minecraft:inventory" value={{ container_type: "inventory", inventory_size: 36, private: true, restrict_to_owner: false }} />
        <RawComponent type="minecraft:navigation.walk" value={{ can_path_over_water: true, can_pass_doors: true, can_open_doors: true, can_jump: true, avoid_damage_blocks: true }} />
        <RawComponent type="minecraft:movement.basic" value={{}} />
        <RawComponent type="minecraft:jump.static" value={{}} />
        <RawComponent type="minecraft:movement" value={{ value: 0.25 }} />
        <RawComponent type="minecraft:behavior.float" value={{ priority: 0 }} />
        <RawComponent type="minecraft:behavior.look_at_player" value={{ priority: 7, look_distance: 8, probability: 0.02 }} />
        <RawComponent type="minecraft:conditional_bandwidth_optimization" value={{}} />
        <RawComponent type="minecraft:can_climb" value={{}} />
        <RawComponent type="minecraft:attack" value={{ damage: 4 }} />
        <RawComponent type="minecraft:behavior.hurt_by_target" value={{ priority: 1, entity_types: { filters: { all_of: [
            { test: "is_family", subject: "other", operator: "!=", value: "player" },
            { test: "is_family", subject: "other", operator: "!=", value: "{{ns}}_{{char}}" },
        ] } } }} />
    </Entity>
);
