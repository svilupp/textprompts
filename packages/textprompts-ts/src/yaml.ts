import YAML from "yaml";

import { InvalidMetadataError } from "./errors";

export const parseYaml = (text: string): Record<string, unknown> => {
  const result = YAML.parse(text);
  if (result == null) {
    return {};
  }
  if (typeof result !== "object" || Array.isArray(result)) {
    // Throw generic Error (not InvalidMetadataError) so parser falls through
    // to report the TOML error - user likely was trying TOML syntax
    throw new Error(`Front matter must be a mapping, got ${typeof result}`);
  }
  return normalizeYamlValues(result as Record<string, unknown>);
};

/**
 * Normalize YAML-parsed values to match expected types.
 * YAML auto-converts some values (e.g. dates, booleans, numbers).
 */
const normalizeYamlValues = (data: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      // Convert dates to ISO date string (YYYY-MM-DD)
      normalized[key] = value.toISOString().split("T")[0];
    } else if (typeof value === "boolean") {
      normalized[key] = String(value);
    } else if (typeof value === "number") {
      normalized[key] = String(value);
    } else if (Array.isArray(value)) {
      // Validate array doesn't contain objects
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          throw new InvalidMetadataError(
            `Arrays containing objects not supported in front matter metadata: '${key}' contains an object. Use simple values only.`,
          );
        }
      }
      normalized[key] = value;
    } else if (typeof value === "object" && value !== null) {
      throw new InvalidMetadataError(
        `Nested objects not supported in front matter metadata: '${key}' contains a nested object. Use flat key-value pairs only.`,
      );
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
};
