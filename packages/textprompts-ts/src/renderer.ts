/**
 * AST renderer (SPEC §3.3 / §3.4).
 *
 * Walks the AST produced by `parseBody` and emits the rendered string per the
 * v2 whitespace rules. Format-time validation lives in `format-validation.ts`
 * — callers are expected to run that first; the renderer assumes inputs have
 * already been checked and only enforces enough to render coherently.
 *
 * Block form: the parser already stripped control-keyword lines from each
 * branch body, so an active branch renders by concatenating its body nodes
 * verbatim. Inactive branches contribute nothing.
 *
 * Inline form: same shape — the body nodes are substituted in place. Text
 * before the opener and after the closer (which lives on adjacent sibling
 * text nodes) is preserved without any special whitespace handling.
 */

import type { Node, SwitchNode } from "./ast";

export interface FormatInputs {
  variables: Record<string, unknown>;
  flags: Record<string, boolean | string>;
}

const renderNodes = (nodes: ReadonlyArray<Node>, inputs: FormatInputs): string => {
  let out = "";
  for (const node of nodes) {
    out += renderNode(node, inputs);
  }
  return out;
};

const renderNode = (node: Node, inputs: FormatInputs): string => {
  switch (node.kind) {
    case "text":
      return node.value;
    case "variable": {
      // Validation should have caught missing variables already; fall through
      // to `String(undefined)` only as a defensive default — but in practice
      // `validateInputs` runs first. Keep the contract: `String(value)`.
      const value = inputs.variables[node.name];
      return String(value);
    }
    case "if": {
      const raw = inputs.flags[node.flag];
      // Defensive: treat missing as false. Validation should have caught it.
      const truthy = typeof raw === "boolean" ? raw : raw !== undefined && raw !== "";
      const active = node.negated ? !truthy : truthy;
      if (active) return renderNodes(node.body, inputs);
      if (node.elseBody !== undefined) return renderNodes(node.elseBody, inputs);
      return "";
    }
    case "switch":
      return renderSwitch(node, inputs);
  }
};

const renderSwitch = (node: SwitchNode, inputs: FormatInputs): string => {
  const raw = inputs.flags[node.flag];
  // Cases match on string value. Booleans don't make sense in switch, but
  // tolerate by coercing to string for matching purposes (the validator will
  // have raised before this point for declared flags).
  const value = typeof raw === "string" ? raw : raw === undefined ? "" : String(raw);
  for (const c of node.cases) {
    if (c.value === value) return renderNodes(c.body, inputs);
  }
  if (node.elseBody !== undefined) return renderNodes(node.elseBody, inputs);
  return "";
};

/**
 * Render an AST to a string given variable + flag inputs.
 *
 * Callers should invoke `validateInputs` first; the renderer trusts inputs
 * and does not surface friendly errors for missing flags/variables.
 */
export const render = (nodes: ReadonlyArray<Node>, inputs: FormatInputs): string => {
  return renderNodes(nodes, inputs);
};
