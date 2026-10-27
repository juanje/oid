/** A function whose body is the same run of significant lines under any name and message: the duplication tests' copy. */
export const checkBlock = (name: string, message: string): string =>
  [
    `export function ${name}(raw: string): string {`,
    `  const value = raw.trim();`,
    `  if (value === "") {`,
    `    throw new Error("${message}");`,
    `  }`,
    `  if (value.length > 40) {`,
    `    throw new Error("${message}: too long");`,
    `  }`,
    `  return value;`,
    `}`,
  ].join("\n");
