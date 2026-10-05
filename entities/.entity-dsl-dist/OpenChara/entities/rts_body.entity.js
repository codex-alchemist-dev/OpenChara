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
exports.default = (OpenRockEntity.createElement(entity_dsl_1.Entity, { identifier: "{{ns}}:rts_body", formatVersion: "1.21.10", clientFormatVersion: "1.10.0", materials: { "default": "entity_alphatest" }, textures: { "default": "textures/entity/steve" }, geometry: { "default": "geometry.humanoid.custom" }, renderControllers: ["controller.render.default"] },
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:type_family", value: { "family": ["{{ns}}_rts_body", "inanimate"] } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:collision_box", value: { "width": 0.6, "height": 1.8 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:physics", value: { "has_gravity": true, "has_collision": true } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:pushable", value: { "is_pushable": false, "is_pushable_by_piston": false } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:health", value: { "value": 20, "max": 20 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:damage_sensor", value: { "triggers": { "deals_damage": false } } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:knockback_resistance", value: { "value": 1 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:nameable", value: { "always_show": true, "allow_name_tag_renaming": false } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:inventory", value: { "container_type": "inventory", "inventory_size": 42, "private": true } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:persistent", value: {} })));
//# sourceMappingURL=rts_body.entity.js.map