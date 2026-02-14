import YAML from "yaml";

export const parseYaml = (text: string): Record<string, unknown> => {
  const result = YAML.parse(text);
  if (result == null) {
    return {};
  }
  if (typeof result !== "object" || Array.isArray(result)) {
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
      if (key === "created") {
        // Keep as ISO string for the created field
        normalized[key] = value.toISOString().split("T")[0];
      } else {
        normalized[key] = value.toISOString().split("T")[0];
      }
    } else if (typeof value === "boolean") {
      normalized[key] = String(value);
    } else if (typeof value === "number") {
      normalized[key] = String(value);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      throw new Error(
        `Nested objects not supported in front matter metadata: '${key}' contains a nested object. Use flat key-value pairs only.`,
      );
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
};
