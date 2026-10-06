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
// One cube entity that can look like any block in the generated appearance table (src/build/blockAppearance.js): the
// synced property `ghost_tex` picks the block's side/top/bottom textures, `ghost_kind` picks build (small, light blue, translucent) or mine (slightly large,
// red, translucent). Visible to every player - see build/ghostBlocks.js for the limits.
const V = (0, entity_dsl_1.vars)();
exports.default = (OpenRockEntity.createElement(entity_dsl_1.Entity, { identifier: "{{ns}}:ghost_block", formatVersion: "1.21.10", properties: {
        "{{ns}}:ghost_kind": { type: "int", range: [0, 1], default: 1, client_sync: true },
        "{{ns}}:ghost_tex": { type: "int", range: [0, V.ghostBlockCount - 1], default: 0, client_sync: true },
    }, clientFormatVersion: "1.10.0", materials: { default: "entity_alphablend" }, textures: V.ghostTextures, geometry: { default: "geometry.{{ns}}_ghost_cube" }, renderControllers: ["controller.render.{{ns}}_ghost_block"], clientScripts: { scale: "query.property('{{ns}}:ghost_kind') == 0 ? 1.02 : 0.9" } },
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:type_family", value: { family: ["{{ns}}_ghost", "inanimate"] } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:collision_box", value: { width: 0.01, height: 0.01 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:physics", value: { has_gravity: false, has_collision: false } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:pushable", value: { is_pushable: false, is_pushable_by_piston: false } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:health", value: { value: 1000000, max: 1000000 } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:damage_sensor", value: { triggers: { deals_damage: false } } }),
    OpenRockEntity.createElement(entity_dsl_1.RawComponent, { type: "minecraft:knockback_resistance", value: { value: 1 } })));
//# sourceMappingURL=ghost_block.entity.js.map