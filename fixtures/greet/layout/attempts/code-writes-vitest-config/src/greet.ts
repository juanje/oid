import { SALUTATION } from "../shared/salutation.ts";

export function greet(name: string): string {
  return `${SALUTATION}, ${name}!`;
}
