// Loaded with node --import: appends the URL of every module Node resolves to the file OID_LOADED_MODULES names (NFR-07).
import { appendFileSync } from "node:fs";
import { registerHooks } from "node:module";

const out = process.env.OID_LOADED_MODULES;
registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    if (out) appendFileSync(out, `${resolved.url}\n`);
    return resolved;
  },
});
