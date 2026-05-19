import { describe, expect, test } from "bun:test";

import { FrontmatterError } from "../src/errors";
import {
  parseFlagsAndVariables,
  type BooleanFlag,
  type EnumFlag,
} from "../src/frontmatter-schema";
import { MetadataMode } from "../src/config";
import { Prompt } from "../src/models";
import { parseToml } from "../src/toml";
import { parseYaml } from "../src/yaml";

const tomlFm = (toml: string): Record<string, unknown> => parseToml(toml) as Record<string, unknown>;
const yamlFm = (yaml: string): Record<string, unknown> => parseYaml(yaml) as Record<string, unknown>;

describe("parseFlagsAndVariables: empty input", () => {
  test("empty object returns empty records", () => {
    const result = parseFlagsAndVariables({});
    expect(result.flags).toEqual({});
    expect(result.variables).toEqual({});
  });

  test("non-schema fields are ignored", () => {
    const result = parseFlagsAndVariables({
      title: "Demo",
      owner: "@team",
      counts: [1, 2, 3],
    });
    expect(result.flags).toEqual({});
    expect(result.variables).toEqual({});
  });
});

describe("parseFlagsAndVariables: boolean flags", () => {
  test("explicit type=boolean", () => {
    const data = tomlFm(
      `[flags.premium_tier]\ntype = "boolean"\ndescription = "Premium user"`,
    );
    const { flags } = parseFlagsAndVariables(data);
    expect(flags.premium_tier).toEqual({
      kind: "boolean",
      description: "Premium user",
      extras: {},
    } satisfies BooleanFlag);
  });

  test("shorthand (no type) defaults to boolean", () => {
    const data = tomlFm(`[flags.show_tips]\ndescription = "Show onboarding tips"`);
    const { flags } = parseFlagsAndVariables(data);
    expect(flags.show_tips.kind).toBe("boolean");
    expect(flags.show_tips.description).toBe("Show onboarding tips");
  });

  test("boolean flag with no description", () => {
    const data = tomlFm(`[flags.has_history]\ntype = "boolean"`);
    const { flags } = parseFlagsAndVariables(data);
    expect(flags.has_history).toEqual({
      kind: "boolean",
      extras: {},
    } satisfies BooleanFlag);
    expect(flags.has_history.description).toBeUndefined();
  });
});

describe("parseFlagsAndVariables: enum flags", () => {
  test("enum flag with values", () => {
    const data = tomlFm(
      `[flags.tier]\ntype = "enum"\nvalues = ["free", "premium", "enterprise"]\ndescription = "Subscription tier"`,
    );
    const { flags } = parseFlagsAndVariables(data);
    expect(flags.tier).toEqual({
      kind: "enum",
      values: ["free", "premium", "enterprise"],
      description: "Subscription tier",
      extras: {},
    } satisfies EnumFlag);
  });

  test("enum value order is preserved", () => {
    const data = tomlFm(`[flags.tier]\ntype = "enum"\nvalues = ["c", "a", "b"]`);
    const { flags } = parseFlagsAndVariables(data);
    expect((flags.tier as EnumFlag).values).toEqual(["c", "a", "b"]);
  });
});

describe("parseFlagsAndVariables: variables", () => {
  test("variable with description", () => {
    const data = tomlFm(`[variables.role]\ndescription = "Assistant role"`);
    const { variables } = parseFlagsAndVariables(data);
    expect(variables.role).toEqual({ description: "Assistant role", extras: {} });
  });

  test("variable with no description", () => {
    const data = tomlFm(`[variables.user_name]`);
    const { variables } = parseFlagsAndVariables(data);
    expect(variables.user_name).toEqual({ extras: {} });
    expect(variables.user_name.description).toBeUndefined();
  });
});

describe("parseFlagsAndVariables: TOML / YAML parity", () => {
  test("identical flags from equivalent TOML and YAML", () => {
    const toml = tomlFm(
      `[flags.tier]\ntype = "enum"\nvalues = ["free", "premium"]\ndescription = "Tier"\nowner = "@product"\n\n[flags.premium]\ndescription = "Premium toggle"\n\n[variables.user_name]\ndescription = "Name"`,
    );
    const yaml = yamlFm(
      `flags:\n  tier:\n    type: enum\n    values: [free, premium]\n    description: Tier\n    owner: "@product"\n  premium:\n    description: Premium toggle\nvariables:\n  user_name:\n    description: Name\n`,
    );
    const fromToml = parseFlagsAndVariables(toml);
    const fromYaml = parseFlagsAndVariables(yaml);
    expect(fromToml).toEqual(fromYaml);
  });

  test("identical variables from equivalent TOML and YAML", () => {
    const toml = tomlFm(
      `[variables.role]\ndescription = "Role"\nowner = "@team"\n\n[variables.last_question]\ndescription = "Prior question"`,
    );
    const yaml = yamlFm(
      `variables:\n  role:\n    description: Role\n    owner: "@team"\n  last_question:\n    description: Prior question\n`,
    );
    expect(parseFlagsAndVariables(toml).variables).toEqual(
      parseFlagsAndVariables(yaml).variables,
    );
  });
});

describe("parseFlagsAndVariables: extras preservation (three levels)", () => {
  test("per-flag extras preserve original TOML types", () => {
    const data = tomlFm(
      `[flags.tier]\ntype = "enum"\nvalues = ["free", "premium"]\ndescription = "Tier"\nowner = "@product"\nexpires = "2026-12-01"\nrollout = 25\nactive = true\nteams = ["a", "b"]`,
    );
    const { flags } = parseFlagsAndVariables(data);
    const decl = flags.tier as EnumFlag;
    expect(decl.extras.owner).toBe("@product");
    expect(decl.extras.expires).toBe("2026-12-01");
    expect(decl.extras.rollout).toBe(25);
    expect(decl.extras.active).toBe(true);
    expect(decl.extras.teams).toEqual(["a", "b"]);
    // standard fields not in extras
    expect("type" in decl.extras).toBe(false);
    expect("values" in decl.extras).toBe(false);
    expect("description" in decl.extras).toBe(false);
  });

  test("per-variable extras preserve original YAML types", () => {
    const data = yamlFm(
      `variables:\n  last_question:\n    description: Prior question\n    owner: "@support"\n    pii: true\n    max_chars: 200\n`,
    );
    const { variables } = parseFlagsAndVariables(data);
    const decl = variables.last_question;
    expect(decl.extras.owner).toBe("@support");
    expect(decl.extras.pii).toBe(true);
    expect(decl.extras.max_chars).toBe(200);
    expect("description" in decl.extras).toBe(false);
  });

  test("top-level extras reachable via loaded Prompt.meta.extras", () => {
    const content = `---
title = "Demo"
owner = "@team"
last_reviewed = "2026-04-30"
priority = 7

[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "Tier"
owner_flag = "@product"

[variables.role]
description = "Role"
notes = "internal"
---
Hello {role}.
`;
    const prompt = Prompt.fromString(content, { metadata: MetadataMode.ALLOW });
    // top-level extras
    expect(prompt.meta?.extras.owner).toBe("@team");
    expect(prompt.meta?.extras.last_reviewed).toBe("2026-04-30");
    expect(prompt.meta?.extras.priority).toBe(7);
    // schema sections NOT in extras
    expect("flags" in (prompt.meta?.extras ?? {})).toBe(false);
    expect("variables" in (prompt.meta?.extras ?? {})).toBe(false);
    // per-flag extras
    expect(prompt.meta?.flags.tier.extras.owner_flag).toBe("@product");
    // per-variable extras
    expect(prompt.meta?.variables.role.extras.notes).toBe("internal");
  });
});

describe("parseFlagsAndVariables: raw flags/variables NOT copied to meta.extras", () => {
  test("raw flags/variables keys are excluded from top-level extras", () => {
    const content = `---
title = "Demo"

[flags.t]
description = "T"

[variables.v]
description = "V"
---
Body {v}.
`;
    const prompt = Prompt.fromString(content, { metadata: MetadataMode.ALLOW });
    expect(prompt.meta?.extras).toEqual({});
    expect(prompt.meta?.flags.t).toBeDefined();
    expect(prompt.meta?.variables.v).toBeDefined();
  });
});

describe("parseFlagsAndVariables: errors — identifiers", () => {
  test("invalid identifier in flag name → E_INVALID_IDENTIFIER", () => {
    const data = { flags: { "bad-name": { description: "x" } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_IDENTIFIER");
    }
  });

  test("reserved keyword as flag name → E_RESERVED_IDENTIFIER", () => {
    const data = { flags: { if: { description: "x" } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_RESERVED_IDENTIFIER");
    }
  });

  test("reserved keyword `flags` as flag name → E_RESERVED_IDENTIFIER", () => {
    const data = { flags: { flags: { description: "x" } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_RESERVED_IDENTIFIER");
    }
  });

  test("invalid identifier in variable name → E_INVALID_IDENTIFIER", () => {
    const data = { variables: { "1bad": { description: "x" } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_IDENTIFIER");
    }
  });

  test("reserved keyword as variable name → E_RESERVED_IDENTIFIER", () => {
    const data = { variables: { switch: { description: "x" } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_RESERVED_IDENTIFIER");
    }
  });
});

describe("parseFlagsAndVariables: errors — flag type", () => {
  test("invalid type string → E_INVALID_FLAG_TYPE", () => {
    const data = { flags: { foo: { type: "string", description: "x" } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_FLAG_TYPE");
    }
  });
});

describe("parseFlagsAndVariables: errors — flag values", () => {
  test("enum missing values → E_INVALID_FLAG_VALUES", () => {
    const data = { flags: { tier: { type: "enum", description: "T" } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_FLAG_VALUES");
    }
  });

  test("enum with empty values → E_INVALID_FLAG_VALUES", () => {
    const data = { flags: { tier: { type: "enum", values: [] } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_FLAG_VALUES");
    }
  });

  test("enum with non-array values → E_INVALID_FLAG_VALUES", () => {
    const data = { flags: { tier: { type: "enum", values: "free,premium" } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_FLAG_VALUES");
    }
  });

  test("enum with non-string entry → E_INVALID_FLAG_VALUES", () => {
    const data = { flags: { tier: { type: "enum", values: ["free", 42] } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_FLAG_VALUES");
    }
  });

  test("enum value not a valid identifier → E_INVALID_IDENTIFIER", () => {
    const data = { flags: { tier: { type: "enum", values: ["free-tier"] } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_IDENTIFIER");
    }
  });

  test("enum value that is reserved keyword → E_RESERVED_IDENTIFIER", () => {
    const data = { flags: { tier: { type: "enum", values: ["free", "end"] } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_RESERVED_IDENTIFIER");
    }
  });

  test("enum with duplicate values → E_INVALID_FLAG_VALUES", () => {
    const data = { flags: { tier: { type: "enum", values: ["free", "free"] } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_FLAG_VALUES");
    }
  });

  test("boolean flag with values → E_INVALID_FLAG_VALUES", () => {
    const data = { flags: { foo: { type: "boolean", values: ["a"] } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_FLAG_VALUES");
    }
  });

  test("shorthand (no type) with values → E_INVALID_FLAG_VALUES", () => {
    const data = { flags: { foo: { values: ["a"] } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_INVALID_FLAG_VALUES");
    }
  });
});

describe("parseFlagsAndVariables: errors — schema shape", () => {
  test("flags section is array → E_BAD_SCHEMA_SHAPE", () => {
    const data = { flags: ["nope"] };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_BAD_SCHEMA_SHAPE");
    }
  });

  test("variables section is string → E_BAD_SCHEMA_SHAPE", () => {
    const data = { variables: "not a table" };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_BAD_SCHEMA_SHAPE");
    }
  });

  test("individual flag entry is not an object → E_BAD_SCHEMA_SHAPE", () => {
    const data = { flags: { foo: "boolean" } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_BAD_SCHEMA_SHAPE");
    }
  });

  test("flag description not a string → E_BAD_SCHEMA_SHAPE", () => {
    const data = { flags: { foo: { description: 42 } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_BAD_SCHEMA_SHAPE");
    }
  });

  test("variable description not a string → E_BAD_SCHEMA_SHAPE", () => {
    const data = { variables: { v: { description: true } } };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_BAD_SCHEMA_SHAPE");
    }
  });
});

describe("parseFlagsAndVariables: errors — duplicate name", () => {
  test("same name in flags and variables → E_DUPLICATE_NAME", () => {
    const data = {
      flags: { tier: { type: "enum", values: ["a", "b"] } },
      variables: { tier: { description: "x" } },
    };
    try {
      parseFlagsAndVariables(data);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FrontmatterError);
      expect((err as FrontmatterError).code).toBe("E_DUPLICATE_NAME");
    }
  });
});

describe("PromptMeta JSON round-trip", () => {
  test("meta with flags + variables + extras serializes losslessly via JSON", () => {
    const content = `---
title = "Demo"
owner = "@team"

[flags.tier]
type = "enum"
values = ["free", "premium"]
description = "Tier"
owner_flag = "@product"

[flags.show_tips]
description = "Tips"

[variables.role]
description = "Role"
pii = false
---
Body {role}.
`;
    const prompt = Prompt.fromString(content, { metadata: MetadataMode.ALLOW });
    const json = JSON.stringify(prompt.meta);
    expect(json.length).toBeGreaterThan(0);
    const restored = JSON.parse(json) as typeof prompt.meta;
    expect(restored).toEqual(prompt.meta);
    // Spot-check shape is plain objects, not Maps or class instances
    expect(restored?.flags.tier.kind).toBe("enum");
    expect((restored.flags.tier as EnumFlag).values).toEqual(["free", "premium"]);
    expect(restored?.flags.tier.extras.owner_flag).toBe("@product");
    expect(restored?.variables.role.extras.pii).toBe(false);
    expect(restored?.extras.owner).toBe("@team");
  });
});

describe("PromptMeta normalization", () => {
  test("loaded prompt always has flags/variables/extras even with no frontmatter", () => {
    const prompt = Prompt.fromString("Just body.");
    expect(prompt.meta?.flags).toEqual({});
    expect(prompt.meta?.variables).toEqual({});
    expect(prompt.meta?.extras).toEqual({});
  });

  test("Prompt constructor normalizes partial meta", () => {
    const prompt = new Prompt({
      path: "/x.txt",
      meta: { title: "T" },
      prompt: "Body.",
    });
    expect(prompt.meta?.flags).toEqual({});
    expect(prompt.meta?.variables).toEqual({});
    expect(prompt.meta?.extras).toEqual({});
  });
});
