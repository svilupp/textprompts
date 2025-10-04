export const MetadataMode = {
  STRICT: "strict",
  ALLOW: "allow",
  IGNORE: "ignore",
} as const;

export type MetadataMode = (typeof MetadataMode)[keyof typeof MetadataMode];

const normalizeMode = (mode: string): MetadataMode => {
  const lower = mode.toLowerCase();
  if (lower === MetadataMode.STRICT || lower === MetadataMode.ALLOW || lower === MetadataMode.IGNORE) {
    return lower;
  }
  throw new Error(
    `Invalid metadata mode: ${mode}. Valid modes: ${[MetadataMode.STRICT, MetadataMode.ALLOW, MetadataMode.IGNORE].join(", ")}`,
  );
};

const envMode =
  typeof process !== "undefined" && process?.env?.TEXTPROMPTS_METADATA_MODE
    ? process.env.TEXTPROMPTS_METADATA_MODE
    : undefined;

let currentMetadataMode: MetadataMode = (() => {
  if (!envMode) {
    return MetadataMode.IGNORE;
  }
  try {
    return normalizeMode(envMode);
  } catch {
    return MetadataMode.IGNORE;
  }
})();

let warnIgnoredMetadata = true;

export const setMetadata = (mode: MetadataMode | string): void => {
  const resolved = typeof mode === "string" ? normalizeMode(mode) : mode;
  currentMetadataMode = resolved;
};

export const getMetadata = (): MetadataMode => currentMetadataMode;

export const skipMetadata = ({ skipWarning = false }: { skipWarning?: boolean } = {}): void => {
  warnIgnoredMetadata = !skipWarning;
  setMetadata(MetadataMode.IGNORE);
};

export const warnOnIgnoredMetadata = (): boolean => warnIgnoredMetadata;

export const resolveMetadataMode = (
  mode: MetadataMode | string | null | undefined,
): MetadataMode => {
  if (mode == null) {
    return currentMetadataMode;
  }
  return typeof mode === "string" ? normalizeMode(mode) : mode;
};
