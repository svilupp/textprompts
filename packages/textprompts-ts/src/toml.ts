import { parse as parseFallback } from "@iarna/toml";

type BunTomlParser = ((input: string) => unknown) | undefined;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      Bun?: {
        TOML?: {
          parse?: (text: string) => unknown;
        };
      };
    }
  }
}

const getBunParser = (): BunTomlParser => {
  const candidate = (globalThis as { Bun?: { TOML?: { parse?: BunTomlParser } } }).Bun?.TOML?.parse;
  return typeof candidate === "function" ? candidate : undefined;
};

export const parseToml = (text: string): Record<string, unknown> => {
  const bunParser = getBunParser();
  if (bunParser) {
    return bunParser(text) as Record<string, unknown>;
  }
  return parseFallback(text) as Record<string, unknown>;
};
