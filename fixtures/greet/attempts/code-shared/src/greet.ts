import { salutation } from "../shared/salutation.ts";

export function greet(name: string): string {
  return `${salutation(name)}, ${name}!`;
}
