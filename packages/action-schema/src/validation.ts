import type { ActionTarget, CoordinateTarget, ElementTarget } from "./target";
import type {
  AgentAction,
  ClickAction,
  NavigateAction,
  ScrollAction,
  SelectAction,
  TypeAction,
} from "./actions";

/**
 * Maximum permitted vertical scroll displacement per scroll action (in pixels).
 */
export const MAX_SCROLL_AMOUNT = 1000;

/**
 * Maximum permitted string character length for type/select actions.
 */
export const MAX_TEXT_LENGTH = 10000;

/**
 * Validates whether an unknown target conforms to an ElementTarget or CoordinateTarget.
 *
 * @param target Candidate target object.
 * @returns True if target is a valid ActionTarget, false otherwise.
 */
export function isValidTarget(target: unknown): target is ActionTarget {
  if (typeof target !== "object" || target === null || Array.isArray(target)) {
    return false;
  }

  const candidate = target as Record<string, unknown>;

  // Check if candidate is an ElementTarget
  if ("elementId" in candidate) {
    if (typeof candidate.elementId === "string" && candidate.elementId.trim().length > 0) {
      return true;
    }
    return false;
  }

  // Check if candidate is a CoordinateTarget
  if ("x" in candidate && "y" in candidate) {
    if (
      typeof candidate.x === "number" &&
      typeof candidate.y === "number" &&
      Number.isFinite(candidate.x) &&
      Number.isFinite(candidate.y)
    ) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Validates whether a given URL string is syntactically valid and uses a safe protocol.
 * Only 'http:' and 'https:' protocols are permitted. Dangerous protocols such as
 * 'javascript:', 'data:', 'file:', and browser-internal schemes are strictly rejected.
 *
 * @param url Candidate URL string.
 * @returns True if the URL is valid and safe, false otherwise.
 */
export function isValidNavigateUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.trim().length === 0) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Runtime guard validating whether an untrusted value conforms to the AgentAction schema.
 *
 * SECURITY:
 * Never trust raw JSON responses from the server. This validator strictly guarantees
 * that only permitted action types, valid target descriptors, bounded parameters,
 * and safe URLs are accepted by the browser extension.
 *
 * @param action Untrusted input received from server or external source.
 * @returns True if input strictly matches AgentAction, false otherwise.
 */
export function validateAgentAction(action: unknown): action is AgentAction {
  if (typeof action !== "object" || action === null || Array.isArray(action)) {
    return false;
  }

  const candidate = action as Record<string, unknown>;

  if (typeof candidate.type !== "string") {
    return false;
  }

  switch (candidate.type) {
    case "click": {
      return isValidTarget(candidate.target);
    }

    case "scroll": {
      const direction = candidate.direction;
      const amount = candidate.amount;

      if (direction !== "up" && direction !== "down") {
        return false;
      }

      if (
        typeof amount !== "number" ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > MAX_SCROLL_AMOUNT
      ) {
        return false;
      }

      return true;
    }

    case "type": {
      if (!isValidTarget(candidate.target)) {
        return false;
      }

      if (
        typeof candidate.value !== "string" ||
        candidate.value.length > MAX_TEXT_LENGTH
      ) {
        return false;
      }

      return true;
    }

    case "select": {
      if (!isValidTarget(candidate.target)) {
        return false;
      }

      if (
        typeof candidate.value !== "string" ||
        candidate.value.length > MAX_TEXT_LENGTH
      ) {
        return false;
      }

      return true;
    }

    case "navigate": {
      return isValidNavigateUrl(candidate.url);
    }

    default:
      return false;
  }
}
