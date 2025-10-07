import { extractPlaceholders, validateFormatArgs } from "./placeholder-utils";
import { PLACEHOLDER_PATTERN } from "./constants";

export interface FormatCallOptions {
  skipValidation?: boolean;
}

export interface FormatOptions extends FormatCallOptions {
  args?: unknown[];
  kwargs?: Record<string, unknown>;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class PromptString {
  readonly value: string;
  readonly placeholders: Set<string>;

  constructor(value: string) {
    this.value = value;
    this.placeholders = extractPlaceholders(value);
  }

  format(kwargs: Record<string, unknown>, options?: FormatCallOptions): string;
  format(args: unknown[], kwargs?: Record<string, unknown>, options?: FormatCallOptions): string;
  format(
    arg0?: Record<string, unknown> | unknown[],
    arg1?: Record<string, unknown> | FormatCallOptions,
    arg2?: FormatCallOptions,
  ): string {
    let args: unknown[] = [];
    let kwargs: Record<string, unknown> = {};
    let skipValidation = false;

    if (Array.isArray(arg0)) {
      // format([args], kwargs, options)
      args = arg0;
      kwargs = (arg1 && !("skipValidation" in arg1)) ? arg1 as Record<string, unknown> : {};
      skipValidation = arg2?.skipValidation ?? (arg1 as FormatCallOptions)?.skipValidation ?? false;
    } else if (arg0 === undefined) {
      // format()
      args = [];
      kwargs = {};
      skipValidation = false;
    } else {
      // format(kwargs, options)
      args = [];
      kwargs = arg0;
      skipValidation = (arg1 as FormatCallOptions)?.skipValidation ?? false;
    }

    const source = this.value.trim();
    if (skipValidation) {
      return this.partialFormat(args, kwargs, source);
    }
    validateFormatArgs(this.placeholders, args, kwargs, false);

    // Track position for empty placeholders
    let emptyPlaceholderIndex = 0;

    return source.replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
      if (Object.prototype.hasOwnProperty.call(kwargs, key)) {
        return String(kwargs[key]);
      }
      const index = Number.parseInt(key, 10);
      if (!Number.isNaN(index) && index < args.length) {
        return String(args[index]);
      }
      if (key === "" && args.length > 0) {
        const value = String(args[emptyPlaceholderIndex] ?? _match);
        emptyPlaceholderIndex++;
        return value;
      }
      return _match;
    });
  }

  private partialFormat(args: unknown[], kwargs: Record<string, unknown>, source: string): string {
    const merged: Record<string, unknown> = { ...kwargs };
    args.forEach((value, index) => {
      merged[String(index)] = value;
    });
    let result = source;
    for (const placeholder of this.placeholders) {
      if (Object.prototype.hasOwnProperty.call(merged, placeholder)) {
        const value = merged[placeholder];
        // Skip null/undefined values - leave placeholder unreplaced
        if (value != null) {
          const pattern = new RegExp(`\\{${escapeRegExp(placeholder)}(?::[^}]*)?\\}`, "g");
          result = result.replace(pattern, String(value));
        }
      }
    }
    return result;
  }

  toString(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }

  strip(): string {
    return this.value.trim();
  }

  slice(start?: number, end?: number): string {
    return this.value.slice(start, end);
  }

  get length(): number {
    return this.value.length;
  }
}
