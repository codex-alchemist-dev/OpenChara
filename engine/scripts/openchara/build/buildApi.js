// Build mode's public surface for projects (re-exported from api.js) and its one start() hook.
import { startBuild } from "./buildMode.js";
import { startSchematicOverlay } from "./schematicOverlay.js";

export { enterBuild, exitBuild, isInBuild, registerBuildExitHook, buildAction, setBuildBlock, getBuildInfo } from "./buildMode.js";
export { schematicsOf, STATUS as SCHEMATIC_STATUS } from "./schematicDb.js";

export function startBuildMode() { startBuild(); startSchematicOverlay(); }
