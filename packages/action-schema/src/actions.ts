import type { ActionTarget } from "./target";

/**
 * Click interaction on a targeted element or viewport coordinate.
 */
export interface ClickAction {
  type: "click";
  target: ActionTarget;
}

/**
 * Scroll interaction specifying vertical direction and pixel displacement.
 */
export interface ScrollAction {
  type: "scroll";
  direction: "up" | "down";
  amount: number;
}

/**
 * Text entry interaction targeting an input field.
 */
export interface TypeAction {
  type: "type";
  target: ActionTarget;
  value: string;
}

/**
 * Selection interaction targeting a dropdown, radio, or selectable element.
 */
export interface SelectAction {
  type: "select";
  target: ActionTarget;
  value: string;
}

/**
 * Top-level browser navigation to a safe web URL (restricted to HTTP/HTTPS).
 */
export interface NavigateAction {
  type: "navigate";
  url: string;
}

/**
 * Union of all permissible structured actions issued by the agent server.
 *
 * SECURITY CONTRACT:
 * Arbitrary script execution, code evaluation, and undocumented raw commands
 * are strictly prohibited from this schema. The browser executor will only
 * execute actions explicitly matching these structured variants.
 */
export type AgentAction =
  | ClickAction
  | ScrollAction
  | TypeAction
  | SelectAction
  | NavigateAction;
