import { greetAll } from "./greet-all.ts";

export function greetList(names: string[]): string {
  return greetAll(names);
}
