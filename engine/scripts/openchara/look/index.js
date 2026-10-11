// The look & forms layer's public surface (re-exported by api.js).
export { registerSkinCondition, resolveSkin, matches, skinConditionNames } from "./skinRules.js";
export { registerBuiltinSkinConditions, compare } from "./builtinConditions.js";
export { registerLookContextProvider, buildLookContext } from "./lookContext.js";
export { registerWeaponCategory, weaponCategory } from "./weapons.js";
export { chooseForm, formForWeapon, registerTacticalConditions, formIds, defaultFormOf, policyOf } from "./formSelect.js";
export { formOf, formDef, classIdOf, classOf, setForm, speciesOf, applyCombatRole, activeAbilities } from "./forms.js";
export { evaluateForm, evaluateSquadForms, tacticalFields, carriedWeapons, equipWeapon, startFormController } from "./formController.js";
export { refreshLook, startLookSystem } from "./lookSystem.js";
export { addDirt, setWetness } from "./lookState.js";
export { pick as pickVariation, bucketOf, newSeed } from "./variation.js";
