/**
 * AST node types produced by {@link parseBody} and consumed by the renderer.
 *
 * Internal to the package. Deliberately small: not a lossless CST, not a
 * compiler IR. Just enough structure to drive the §3.3 rendering rules and
 * collect referenced flags / variables for §5.2 validation.
 *
 * Switch cases use an array (not a Map) so authoring order is preserved, debug
 * output serializes naturally, and duplicate-case detection during parse is
 * straightforward.
 */

/** Literal text between tags. */
export interface TextNode {
  readonly kind: "text";
  readonly value: string;
}

/** `{name}` variable interpolation. */
export interface VariableNode {
  readonly kind: "variable";
  readonly name: string;
}

/**
 * `{if flag}…{end}` or `{if !flag}…{else}…{end}`.
 *
 * `form` records whether the construct was authored inline or as a block so
 * the renderer can apply §3.3 whitespace rules without re-inspecting source.
 * For block form, the parser strips the control-keyword lines from each
 * branch body; the renderer concatenates them as-is.
 */
export interface IfNode {
  readonly kind: "if";
  readonly flag: string;
  readonly negated: boolean;
  readonly form: "inline" | "block";
  readonly body: Node[];
  readonly elseBody?: Node[];
}

export interface SwitchCase {
  readonly value: string;
  readonly body: Node[];
}

/** `{switch flag}{case x}…{case y}…{else}…{end}` */
export interface SwitchNode {
  readonly kind: "switch";
  readonly flag: string;
  readonly form: "inline" | "block";
  readonly cases: SwitchCase[];
  readonly elseBody?: Node[];
}

export type Node = TextNode | VariableNode | IfNode | SwitchNode;
