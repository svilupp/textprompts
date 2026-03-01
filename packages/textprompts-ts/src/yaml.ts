import YAML from "yaml";

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
 * Converts Date instances to ISO date strings.
 * All other values (strings, booleans, numbers, arrays, nested objects)
 * are preserved as-is — type coercion for known fields happens
 * downstream in ensurePromptMeta.
 */
const normalizeYamlValues = (data: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      // Convert dates to ISO date string (YYYY-MM-DD)
      normalized[key] = value.toISOString().split("T")[0];
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
};
