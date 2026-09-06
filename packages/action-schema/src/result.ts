import type { AgentAction } from "./actions";

/**
 * High-level execution status returned by the browser executor.
 */
export type ActionResultStatus =
  | "success"
  | "failure";

/**
 * Standard error codes denoting specific failure conditions during action dispatch.
 */
export type ActionErrorCode =
  | "INVALID_ACTION"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_INTERACTABLE"
  | "INVALID_URL"
  | "NAVIGATION_BLOCKED"
  | "EXECUTION_FAILED"
  | "UNKNOWN";

/**
 * Result returned by the browser executor following an action execution attempt.
 */
export interface ActionResult {
  /**
   * Overall outcome status of the dispatched action.
   */
  status: ActionResultStatus;

  /**
   * Type of action that was executed.
   */
  actionType: AgentAction["type"];

  /**
   * Optional human-readable message providing context on execution or failure.
   */
  message?: string;

  /**
   * Machine-readable error code if status is "failure".
   */
  errorCode?: ActionErrorCode;
}
