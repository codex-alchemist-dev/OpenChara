"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const OpenRockEntity = __importStar(require("@openrock/entity-dsl/jsx-runtime"));
const entity_dsl_1 = require("@openrock/entity-dsl");
// The project's character entity. Visuals and the navigation-slot pool come from the consuming
// mod's characters (see src/build/vars.js).
const V = (0, entity_dsl_1.vars)();
const slotGroups = [];
const slotEvents = [];
for (let i = 0; i < V.navigationSlots; i++) {
    slotGroups.push(OpenRockEntity.createElement(entity_dsl_1.ComponentGroup, { name: `{{ns}}:navigating_slot_${i}` },
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.follow_mob", value: {
                filters: { test: "has_tag", subject: "other", value: `{{ns}}_anchor_slot_${i}` },
                search_range: 64, stop_distance: 1, speed_multiplier: 1.3,
            } })));
    slotEvents.push(OpenRockEntity.createElement(entity_dsl_1.Event, { name: `{{ns}}:navigating_on_slot_${i}`, definition: { add: { component_groups: [`{{ns}}:navigating_slot_${i}`] } } }), OpenRockEntity.createElement(entity_dsl_1.Event, { name: `{{ns}}:navigating_off_slot_${i}`, definition: { remove: { component_groups: [`{{ns}}:navigating_slot_${i}`] } } }));
}
const targetFilters = (withCreeperRule) => ({
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
exports.default = (OpenRockEntity.createElement(entity_dsl_1.Entity, { identifier: "{{ns}}:{{char}}", formatVersion: "1.21.10", properties: { "{{ns}}:species_index": { type: "int", range: [0, V.maxCharacterIndex], default: 0, client_sync: true } }, clientFormatVersion: "1.16.0", materials: { default: V.characterMaterial }, textures: V.characterTextures, geometry: { default: V.characterGeometry }, renderControllers: ["controller.render.{{ns}}_{{char}}"], enableAttachables: true, hideArmor: false },
    OpenRockEntity.createElement(entity_dsl_1.ComponentGroup, { name: "{{ns}}:despawn" },
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:instant_despawn", value: {} })),
    OpenRockEntity.createElement(entity_dsl_1.ComponentGroup, { name: "{{ns}}:wander" },
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.random_stroll", value: { priority: 6, speed_multiplier: 0.8 } })),
    OpenRockEntity.createElement(entity_dsl_1.ComponentGroup, { name: "{{ns}}:melee" },
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.nearest_attackable_target", value: { priority: 2, reselect_targets: true, within_radius: 16, must_see: true, entity_types: [targetFilters(true)] } }),
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.melee_attack", value: { priority: 3, speed_multiplier: 1.2, track_target: true } })),
    OpenRockEntity.createElement(entity_dsl_1.ComponentGroup, { name: "{{ns}}:ranged" },
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.nearest_attackable_target", value: { priority: 2, reselect_targets: true, within_radius: 16, must_see: true, entity_types: [targetFilters(false)] } }),
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:shooter", value: { def: "minecraft:arrow" } }),
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.ranged_attack", value: { priority: 3, attack_interval_min: 1.2, attack_interval_max: 2.2, attack_radius: 15 } })),
    slotGroups,
    OpenRockEntity.createElement(entity_dsl_1.Event, { name: "{{ns}}:wander_on", definition: { add: { component_groups: ["{{ns}}:wander"] } } }),
    OpenRockEntity.createElement(entity_dsl_1.Event, { name: "{{ns}}:wander_off", definition: { remove: { component_groups: ["{{ns}}:wander"] } } }),
    OpenRockEntity.createElement(entity_dsl_1.Event, { name: "minecraft:entity_spawned", definition: { add: { component_groups: ["{{ns}}:wander", "{{ns}}:melee"] } } }),
    OpenRockEntity.createElement(entity_dsl_1.Event, { name: "{{ns}}:role_melee", definition: { add: { component_groups: ["{{ns}}:melee"] }, remove: { component_groups: ["{{ns}}:ranged"] } } }),
    OpenRockEntity.createElement(entity_dsl_1.Event, { name: "{{ns}}:role_ranged", definition: { add: { component_groups: ["{{ns}}:ranged"] }, remove: { component_groups: ["{{ns}}:melee"] } } }),
    slotEvents,
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:type_family", value: { family: ["{{ns}}_{{char}}"] } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:collision_box", value: { width: 0.6, height: 1.9 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:health", value: { value: 40, max: 40 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:physics", value: {} }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:pushable", value: { is_pushable: true, is_pushable_by_piston: true } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:nameable", value: {} }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:damage_sensor", value: { triggers: { cause: "fall", deals_damage: false } } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:inventory", value: { container_type: "inventory", inventory_size: 36, private: true, restrict_to_owner: false } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:navigation.walk", value: { can_path_over_water: true, can_pass_doors: true, can_open_doors: true, can_jump: true, avoid_damage_blocks: true } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:movement.basic", value: {} }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:jump.static", value: {} }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:movement", value: { value: 0.25 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.float", value: { priority: 0 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.look_at_player", value: { priority: 7, look_distance: 8, probability: 0.02 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:conditional_bandwidth_optimization", value: {} }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:can_climb", value: {} }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:attack", value: { damage: 4 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:behavior.hurt_by_target", value: { priority: 1, entity_types: { filters: { all_of: [
                        { test: "is_family", subject: "other", operator: "!=", value: "player" },
                        { test: "is_family", subject: "other", operator: "!=", value: "{{ns}}_{{char}}" },
                    ] } } } })));
//# sourceMappingURL=character.entity.js.map