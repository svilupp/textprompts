import * as TOML from "@iarna/toml";

export const parseToml = (text: string): Record<string, unknown> => {
  return TOML.parse(text) as Record<string, unknown>;
};
