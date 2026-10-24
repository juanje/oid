// oid's exit codes (docs/design.md §7).
export const EXIT_BUILT = 0;
/** The command did what was asked without building: it printed the help or the version. */
export const EXIT_OK = 0;
/** The run stopped on a refusal, which an attempt could act on. */
export const EXIT_REFUSED = 1;
/** An error no attempt can fix. */
export const EXIT_ERROR = 2;
/** The run reached a limit, such as the turns of an attempt. */
export const EXIT_LIMIT = 3;
