import { extractPlaceholders, validateFormatArgs } from "./placeholder-utils";

export interface FormatCallOptions {
  skipValidation?: boolean;
}

export interface FormatOptions extends FormatCallOptions {
  args?: unknown[];
  kwargs?: Record<string, unknown>;
}

const placeholderPattern = /\{([^}:]*)(?::[^}]*)?\}/g;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export class PromptString {
  readonly value: string;
  readonly placeholders: Set<string>;

  constructor(value: string) {
    this.value = value;
    this.placeholders = extractPlaceholders(value);
  }

  format(options?: FormatOptions): string;
  format(args: unknown[], kwargs?: Record<string, unknown>, options?: FormatCallOptions): string;
  format(
    arg0?: FormatOptions | unknown[],
    arg1?: Record<string, unknown>,
    arg2?: FormatCallOptions,
  ): string {
    let args: unknown[] = [];
    let kwargs: Record<string, unknown> = {};
    let skipValidation = false;

    if (Array.isArray(arg0) || arg0 === undefined) {
      args = Array.isArray(arg0) ? arg0 : [];
      kwargs = arg1 ?? {};
      skipValidation = arg2?.skipValidation ?? false;
    } else {
      args = arg0.args ?? [];
      kwargs = arg0.kwargs ?? {};
      skipValidation = arg0.skipValidation ?? false;
    }

    const source = this.value.trim();
    if (skipValidation) {
      return this.partialFormat(args, kwargs, source);
    }
    validateFormatArgs(this.placeholders, args, kwargs, false);
    return source.replace(placeholderPattern, (_match, key: string) => {
      if (Object.prototype.hasOwnProperty.call(kwargs, key)) {
        return String(kwargs[key]);
      }
      const index = Number.parseInt(key, 10);
      if (!Number.isNaN(index) && index < args.length) {
        return String(args[index]);
      }
      if (key === "" && args.length > 0) {
        return String(args[0]);
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
        const pattern = new RegExp(`\\{${escapeRegExp(placeholder)}(?::[^}]*)?\\}`, "g");
        result = result.replace(pattern, String(value));
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

export const SafeString = PromptString;
