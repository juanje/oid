const common = {
  import: ["features/support/**/*.ts", "features/steps/**/*.ts"],
  plugin: ["./features/plugins/scenarios-ran.ts"],
};

export default {
  ...common,
  // A real model costs money and answers differently each time: its smoke scenario is run by hand, outside the gate.
  tags: "not @smoke",
  // Each scenario has its own fixture project, recording state and worktrees, so workers do not share anything.
  parallel: 4,
};

/** The real-model smoke scenario: `OID_SMOKE_MODEL=<provider>/<model> NODE_OPTIONS="--import tsx" npx cucumber-js -p smoke`. */
export const smoke = { ...common, tags: "@smoke" };
