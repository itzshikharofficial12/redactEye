import type {
  AgentAction,
  ClickAction,
  ScrollAction,
  TypeAction,
  SelectAction,
  NavigateAction,
  ActionTarget,
  ElementTarget,
  CoordinateTarget,
  ActionResult,
  ActionResultStatus,
  ActionErrorCode,
} from "@redact-eye/action-schema";

export type {
  AgentAction,
  ClickAction,
  ScrollAction,
  TypeAction,
  SelectAction,
  NavigateAction,
  ActionTarget,
  ElementTarget,
  CoordinateTarget,
  ActionResult,
  ActionResultStatus,
  ActionErrorCode,
};

/**
 * Execution options passed to the browser action executor.
 */
export interface BrowserActionOptions {
  /**
   * Active document context. Defaults to global `document`.
   */
  doc?: Document;

  /**
   * Active window context. Defaults to global `window`.
   */
  win?: Window;

  /**
   * Target browser tab ID (used for top-level tab navigation actions).
   */
  tabId?: number;
}
