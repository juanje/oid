export default {
  import: ["features/support/**/*.ts", "features/steps/**/*.ts"],
  plugin: ["./features/plugins/scenarios-ran.ts"],
  // Each scenario has its own fixture project, recording state and worktrees, so workers do not share anything.
  parallel: 4,
};
