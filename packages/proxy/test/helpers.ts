import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const TSX = fileURLToPath(new URL("../../../node_modules/.bin/tsx", import.meta.url));
export const BIN = fileURLToPath(new URL("../../cli/src/bin.ts", import.meta.url));
export const ECHO = fileURLToPath(new URL("./fixtures/echo-server.ts", import.meta.url));

/** argv for `poltergeist wrap [...wrapArgs] -- tsx echo-server.ts` */
export const wrapArgv = (wrapArgs: string[]) => [BIN, "wrap", ...wrapArgs, "--", TSX, ECHO];
