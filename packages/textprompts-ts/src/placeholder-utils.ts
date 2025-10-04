const ESCAPED_OPEN = "\x00ESCAPED_OPEN\x00";
const ESCAPED_CLOSE = "\x00ESCAPED_CLOSE\x00";

export const extractPlaceholders = (text: string): Set<string> => {
  const temp = text.replaceAll("{{", ESCAPED_OPEN).replaceAll("}}", ESCAPED_CLOSE);
  const pattern = /\{([^}:]*)(?::[^}]*)?\}/g;
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(temp))) {
    matches.add(match[1]);
  }
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

  if (placeholders.has("") && args.length > 0) {
    merged[""] = args[0];
  }

  const providedKeys = new Set(Object.keys(merged));
  const missing = Array.from(placeholders).filter((name) => !providedKeys.has(name));

  if (missing.length > 0) {
    throw new Error(`Missing format variables: ${JSON.stringify(missing.sort())}`);
  }
};

export const shouldIgnoreValidation = (ignoreFlag: boolean): boolean => ignoreFlag;

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
