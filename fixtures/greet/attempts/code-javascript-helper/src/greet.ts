import { salutation } from "./helper.js";

export function greet(name: string): string {
  return `${salutation()}, ${name}!`;
}
