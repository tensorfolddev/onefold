// Our own styles are scaled with the screen (postcss-scale.cjs). Lightning CSS still handles prefixes and syntax.
import { fileURLToPath } from "node:url";

export default { plugins: { [fileURLToPath(new URL("./postcss-scale.cjs", import.meta.url))]: {} } }; // a full path: Turbopack resolves names from its build folder
