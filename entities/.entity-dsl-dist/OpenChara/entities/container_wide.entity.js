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
exports.default = (OpenRockEntity.createElement(entity_dsl_1.Entity, { identifier: "{{ns}}:container_wide", formatVersion: "1.21.10", clientFormatVersion: "1.10.0", materials: { "default": "entity_alphatest" }, textures: { "default": "textures/entity/oc_container" }, geometry: { "default": "geometry.oc_container" }, renderControllers: ["controller.render.default"] },
    OpenRockEntity.createElement(entity_dsl_1.ComponentGroup, { name: "{{ns}}_container_tamed" },
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:is_tamed", value: {} }),
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:is_chested", value: {} }),
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:inventory", value: { "container_type": "horse", "inventory_size": 441, "private": false, "restrict_to_owner": true } }),
        OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:equippable", value: { "slots": [{ "slot": 0, "item": "minecraft:saddle", "accepted_items": ["minecraft:saddle"] }, { "slot": 1, "item": "minecraft:apple" }, { "slot": 2, "item": "minecraft:apple" }, { "slot": 3, "item": "minecraft:apple" }, { "slot": 4, "item": "minecraft:apple" }, { "slot": 5, "item": "minecraft:apple" }, { "slot": 6, "item": "minecraft:apple" }] } })),
    OpenRockEntity.createElement(entity_dsl_1.Event, { name: "{{ns}}:container_tamed", definition: { "add": { "component_groups": ["{{ns}}_container_tamed"] } } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:type_family", value: { "family": ["{{ns}}_container", "inanimate"] } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:collision_box", value: { "width": 0.6, "height": 0.6 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:physics", value: { "has_gravity": false, "has_collision": false } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:pushable", value: { "is_pushable": false, "is_pushable_by_piston": false } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:health", value: { "value": 1000000, "max": 1000000 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:damage_sensor", value: { "triggers": { "deals_damage": false } } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:knockback_resistance", value: { "value": 1 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:nameable", value: { "always_show": true, "allow_name_tag_renaming": false } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:persistent", value: {} }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:conditional_bandwidth_optimization", value: {} }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:tameable", value: { "probability": 1, "tame_items": ["minecraft:bone"], "tame_event": { "event": "{{ns}}:container_tamed", "target": "self" } } })));
//# sourceMappingURL=container_wide.entity.js.map