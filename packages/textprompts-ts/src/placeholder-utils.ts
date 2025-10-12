import { ESCAPED_OPEN, ESCAPED_CLOSE, PLACEHOLDER_PATTERN } from "./constants";

export const extractPlaceholders = (text: string): Set<string> => {
  const temp = text.replaceAll("{{", ESCAPED_OPEN).replaceAll("}}", ESCAPED_CLOSE);
  const matches = new Set<string>();
  let match: RegExpExecArray | null = PLACEHOLDER_PATTERN.exec(temp);
  while (match) {
    matches.add(match[1]);
    match = PLACEHOLDER_PATTERN.exec(temp);
  }
  // Reset regex state
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return matches;
};

export const validateFormatArgs = (
  placeholders: Set<string>,
  args: unknown[],
  kwargs: Record<string, unknown>,
  skipValidation = false,
): void => {
  if (skipValidation) {
    return;
  }
  const merged: Record<string, unknown> = { ...kwargs };
  args.forEach((value, index) => {
    merged[String(index)] = value;
  });

  // Count empty placeholders - each needs an arg
  if (placeholders.has("")) {
    // Empty placeholders consume args sequentially, so we need enough args
    // to satisfy all empty placeholders. Since we can't easily count them here,
    // we mark "" as provided if ANY args exist (will be validated during formatting)
    if (args.length > 0) {
      merged[""] = true; // Marker that empty placeholders have args available
    }
  }

  const providedKeys = new Set(Object.keys(merged));
  const missing = Array.from(placeholders).filter((name) => !providedKeys.has(name));

  if (missing.length > 0) {
    throw new Error(`Missing format variables: ${JSON.stringify(missing.sort())}`);
  }
};

export const getPlaceholderInfo = (text: string) => {
  const placeholders = extractPlaceholders(text);
  const names = Array.from(placeholders);
  const hasPositional = names.some((name) => /^\d+$/.test(name));
  const hasNamed = names.some((name) => name !== "" && !/^\d+$/.test(name));
  return {
    count: placeholders.size,
    names: new Set(names),
    hasPositional,
    hasNamed,
    isMixed: hasPositional && hasNamed,
  } as const;
};
