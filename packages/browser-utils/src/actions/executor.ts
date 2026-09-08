import type {
  AgentAction,
  ClickAction,
  ScrollAction,
  TypeAction,
  SelectAction,
  NavigateAction,
  ActionResult,
  BrowserActionOptions,
  ActionTarget,
} from "./types";
import {
  validateAgentAction,
  isValidNavigateUrl,
  MAX_SCROLL_AMOUNT,
} from "@redact-eye/action-schema";
import { resolveElement } from "../dom/ids";
import { isElementVisible, isElementEnabled } from "../dom/visibility";
import { isRestrictedUrl } from "../browser/screenshot";

/**
 * Resolves an action target (by elementId or coordinates) to a DOM Element.
 */
function resolveTarget(target: ActionTarget, doc: Document): Element | null {
  if ("elementId" in target) {
    return resolveElement(target.elementId, doc);
  }

  if ("x" in target && "y" in target) {
    if (typeof doc.elementFromPoint === "function") {
      return doc.elementFromPoint(target.x, target.y);
    }
  }

  return null;
}

/**
 * Executes a click action against a resolved element or coordinates.
 */
async function executeClick(
  action: ClickAction,
  doc: Document,
  win: Window
): Promise<ActionResult> {
  const target = action.target;

  if ("elementId" in target) {
    const el = resolveElement(target.elementId, doc);
    if (!el) {
      return {
        status: "failure",
        actionType: "click",
        errorCode: "TARGET_NOT_FOUND",
        message: `Element not found for ID: ${target.elementId}`,
      };
    }

    if (!isElementEnabled(el)) {
      return {
        status: "failure",
        actionType: "click",
        errorCode: "TARGET_NOT_INTERACTABLE",
        message: `Target element is disabled: ${target.elementId}`,
      };
    }

    if (!isElementVisible(el)) {
      return {
        status: "failure",
        actionType: "click",
        errorCode: "TARGET_NOT_INTERACTABLE",
        message: `Target element is not visible: ${target.elementId}`,
      };
    }

    try {
      if (typeof (el as HTMLElement).click === "function") {
        (el as HTMLElement).click();
      } else {
        el.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
          })
        );
      }
      return {
        status: "success",
        actionType: "click",
        message: `Successfully clicked element: ${target.elementId}`,
      };
    } catch (err) {
      return {
        status: "failure",
        actionType: "click",
        errorCode: "EXECUTION_FAILED",
        message: `Click failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if ("x" in target && "y" in target) {
    const viewportWidth = win.innerWidth || doc.documentElement?.clientWidth || 0;
    const viewportHeight = win.innerHeight || doc.documentElement?.clientHeight || 0;

    if (
      target.x < 0 ||
      target.x > viewportWidth ||
      target.y < 0 ||
      target.y > viewportHeight
    ) {
      return {
        status: "failure",
        actionType: "click",
        errorCode: "TARGET_NOT_INTERACTABLE",
        message: `Coordinates (${target.x}, ${target.y}) are outside viewport bounds (${viewportWidth}x${viewportHeight})`,
      };
    }

    const el = resolveTarget(target, doc);
    if (!el) {
      return {
        status: "failure",
        actionType: "click",
        errorCode: "TARGET_NOT_FOUND",
        message: `No element found at coordinates (${target.x}, ${target.y})`,
      };
    }

    if (!isElementEnabled(el)) {
      return {
        status: "failure",
        actionType: "click",
        errorCode: "TARGET_NOT_INTERACTABLE",
        message: `Target element at (${target.x}, ${target.y}) is disabled`,
      };
    }

    try {
      if (typeof (el as HTMLElement).click === "function") {
        (el as HTMLElement).click();
      } else {
        el.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: target.x,
            clientY: target.y,
          })
        );
      }
      return {
        status: "success",
        actionType: "click",
        message: `Successfully clicked coordinates: (${target.x}, ${target.y})`,
      };
    } catch (err) {
      return {
        status: "failure",
        actionType: "click",
        errorCode: "EXECUTION_FAILED",
        message: `Click at coordinates failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    status: "failure",
    actionType: "click",
    errorCode: "INVALID_ACTION",
    message: "Invalid action target",
  };
}

/**
 * Executes a type action against an editable element target.
 */
async function executeType(
  action: TypeAction,
  doc: Document,
  win: Window
): Promise<ActionResult> {
  const target = action.target;

  let el: Element | null = null;
  if ("elementId" in target) {
    el = resolveElement(target.elementId, doc);
    if (!el) {
      return {
        status: "failure",
        actionType: "type",
        errorCode: "TARGET_NOT_FOUND",
        message: `Element not found for ID: ${target.elementId}`,
      };
    }
  } else if ("x" in target && "y" in target) {
    el = resolveTarget(target, doc);
    if (!el) {
      return {
        status: "failure",
        actionType: "type",
        errorCode: "TARGET_NOT_INTERACTABLE",
        message: "No element found at coordinates for type action",
      };
    }
  }

  if (!el) {
    return {
      status: "failure",
      actionType: "type",
      errorCode: "TARGET_NOT_FOUND",
      message: "Target element not found",
    };
  }

  const tagName = el.tagName.toLowerCase();
  const isInput = tagName === "input";
  const isTextarea = tagName === "textarea";
  const isContentEditable =
    (el as HTMLElement).isContentEditable ||
    el.getAttribute("contenteditable") === "true";

  const nonTextInputs = new Set([
    "button",
    "submit",
    "reset",
    "hidden",
    "image",
    "checkbox",
    "radio",
    "file",
  ]);
  const inputType = (el.getAttribute("type") || "text").toLowerCase();

  if (!isTextarea && !isContentEditable && (!isInput || nonTextInputs.has(inputType))) {
    return {
      status: "failure",
      actionType: "type",
      errorCode: "TARGET_NOT_INTERACTABLE",
      message: `Element <${el.tagName}> is not an editable text field`,
    };
  }

  if (!isElementEnabled(el) || el.hasAttribute("readonly") || (el as any).readOnly) {
    return {
      status: "failure",
      actionType: "type",
      errorCode: "TARGET_NOT_INTERACTABLE",
      message: "Target element is disabled or read-only",
    };
  }

  if (!isElementVisible(el)) {
    return {
      status: "failure",
      actionType: "type",
      errorCode: "TARGET_NOT_INTERACTABLE",
      message: "Target element is not visible",
    };
  }

  try {
    // Focus the target element
    (el as HTMLElement).focus?.();

    // Type the provided value without reading or logging previous/new values
    if (isInput || isTextarea) {
      (el as HTMLInputElement | HTMLTextAreaElement).value = action.value;
      el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    } else if (isContentEditable) {
      el.textContent = action.value;
      el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    }

    // PRIVACY NOTICE: Do not log or include action.value in result message
    return {
      status: "success",
      actionType: "type",
      message: "Successfully entered text into target element",
    };
  } catch (err) {
    return {
      status: "failure",
      actionType: "type",
      errorCode: "EXECUTION_FAILED",
      message: `Type action failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Executes a select action against a <select> element dropdown.
 */
async function executeSelect(
  action: SelectAction,
  doc: Document
): Promise<ActionResult> {
  const target = action.target;

  let el: Element | null = null;
  if ("elementId" in target) {
    el = resolveElement(target.elementId, doc);
  } else if ("x" in target && "y" in target) {
    el = resolveTarget(target, doc);
  }

  if (!el) {
    return {
      status: "failure",
      actionType: "select",
      errorCode: "TARGET_NOT_FOUND",
      message: "Select target element not found",
    };
  }

  if (el.tagName.toLowerCase() !== "select") {
    return {
      status: "failure",
      actionType: "select",
      errorCode: "TARGET_NOT_INTERACTABLE",
      message: `Target element <${el.tagName}> is not a <select> element`,
    };
  }

  if (!isElementEnabled(el)) {
    return {
      status: "failure",
      actionType: "select",
      errorCode: "TARGET_NOT_INTERACTABLE",
      message: "Target <select> element is disabled",
    };
  }

  const selectEl = el as HTMLSelectElement;
  let matched = false;

  for (let i = 0; i < selectEl.options.length; i++) {
    const opt = selectEl.options[i]!;
    if (opt.value === action.value || opt.text.trim() === action.value.trim()) {
      selectEl.selectedIndex = i;
      opt.selected = true;
      matched = true;
      break;
    }
  }

  if (!matched) {
    return {
      status: "failure",
      actionType: "select",
      errorCode: "TARGET_NOT_INTERACTABLE",
      message: "Matching option not found in <select> element",
    };
  }

  try {
    selectEl.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    selectEl.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    return {
      status: "success",
      actionType: "select",
      message: "Successfully selected option in <select> dropdown",
    };
  } catch (err) {
    return {
      status: "failure",
      actionType: "select",
      errorCode: "EXECUTION_FAILED",
      message: `Select failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Executes a scroll action locally within the active window.
 */
async function executeScroll(
  action: ScrollAction,
  win: Window
): Promise<ActionResult> {
  if (action.amount <= 0 || action.amount > MAX_SCROLL_AMOUNT) {
    return {
      status: "failure",
      actionType: "scroll",
      errorCode: "INVALID_ACTION",
      message: `Scroll amount must be between 1 and ${MAX_SCROLL_AMOUNT}px`,
    };
  }

  if (action.direction !== "up" && action.direction !== "down") {
    return {
      status: "failure",
      actionType: "scroll",
      errorCode: "INVALID_ACTION",
      message: "Scroll direction must be 'up' or 'down'",
    };
  }

  const delta = action.direction === "down" ? action.amount : -action.amount;

  try {
    if (typeof win.scrollBy === "function") {
      win.scrollBy(0, delta);
    }
    return {
      status: "success",
      actionType: "scroll",
      message: `Successfully scrolled ${action.direction} by ${action.amount}px`,
    };
  } catch (err) {
    return {
      status: "failure",
      actionType: "scroll",
      errorCode: "EXECUTION_FAILED",
      message: `Scroll failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Executes a top-level tab navigation action.
 */
async function executeNavigate(
  action: NavigateAction,
  win: Window,
  tabId?: number
): Promise<ActionResult> {
  if (!isValidNavigateUrl(action.url)) {
    return {
      status: "failure",
      actionType: "navigate",
      errorCode: "INVALID_URL",
      message: `Invalid navigation URL or disallowed protocol: ${action.url}`,
    };
  }

  if (isRestrictedUrl(action.url)) {
    return {
      status: "failure",
      actionType: "navigate",
      errorCode: "NAVIGATION_BLOCKED",
      message: `Navigation to restricted internal URL is blocked: ${action.url}`,
    };
  }

  try {
    if (
      typeof chrome !== "undefined" &&
      chrome?.tabs?.update &&
      typeof tabId === "number"
    ) {
      await new Promise<void>((resolve, reject) => {
        chrome.tabs.update(tabId, { url: action.url }, () => {
          if (chrome.runtime?.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          resolve();
        });
      });
    } else if (win?.location) {
      win.location.href = action.url;
    }

    return {
      status: "success",
      actionType: "navigate",
      message: `Successfully navigated to ${action.url}`,
    };
  } catch (err) {
    return {
      status: "failure",
      actionType: "navigate",
      errorCode: "EXECUTION_FAILED",
      message: `Navigation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Executes a validated AgentAction locally within the active browser/DOM environment.
 *
 * SECURITY & PRIVACY GUARANTEES:
 * - Rejects any payload that does not strictly match the validated AgentAction schema.
 * - NEVER supports `eval()`, `new Function()`, or arbitrary string script execution.
 * - NEVER logs or persists typed values.
 * - Enforces viewport boundaries and interactable state before execution.
 * - Does not make external network requests.
 *
 * @param action The structured AgentAction to execute.
 * @param options Execution environment options (document, window, tabId).
 * @returns Promise resolving to a structured ActionResult.
 */
export async function executeBrowserAction(
  action: AgentAction,
  options: BrowserActionOptions = {}
): Promise<ActionResult> {
  // 1. Strict schema validation
  if (!validateAgentAction(action)) {
    return {
      status: "failure",
      actionType: (action as any)?.type || "unknown",
      errorCode: "INVALID_ACTION",
      message: "Action does not conform to the validated AgentAction schema",
    };
  }

  const doc =
    options.doc ??
    (typeof document !== "undefined" ? document : null);
  const win =
    options.win ??
    (typeof window !== "undefined" ? window : null);

  if (!doc || !win) {
    return {
      status: "failure",
      actionType: action.type,
      errorCode: "EXECUTION_FAILED",
      message: "Document or Window context is unavailable for action execution",
    };
  }

  switch (action.type) {
    case "click":
      return executeClick(action, doc, win);

    case "type":
      return executeType(action, doc, win);

    case "select":
      return executeSelect(action, doc);

    case "scroll":
      return executeScroll(action, win);

    case "navigate":
      return executeNavigate(action, win, options.tabId);

    default:
      return {
        status: "failure",
        actionType: (action as any).type,
        errorCode: "INVALID_ACTION",
        message: `Unsupported action type: ${(action as any).type}`,
      };
  }
}
