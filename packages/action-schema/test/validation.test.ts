import test from "node:test";
import assert from "node:assert/strict";
import { validateAgentAction } from "../src/validation.ts";

test("validateAgentAction - valid actions", async (t) => {
  await t.test("valid click action with elementId", () => {
    assert.equal(
      validateAgentAction({
        type: "click",
        target: { elementId: "login-button" },
      }),
      true
    );
  });

  await t.test("valid click action with coordinate target", () => {
    assert.equal(
      validateAgentAction({
        type: "click",
        target: { x: 100, y: 200 },
      }),
      true
    );
  });

  await t.test("valid scroll action", () => {
    assert.equal(
      validateAgentAction({
        type: "scroll",
        direction: "down",
        amount: 500,
      }),
      true
    );
  });

  await t.test("valid type action", () => {
    assert.equal(
      validateAgentAction({
        type: "type",
        target: { elementId: "email" },
        value: "demo@example.com",
      }),
      true
    );
  });

  await t.test("valid select action", () => {
    assert.equal(
      validateAgentAction({
        type: "select",
        target: { elementId: "country" },
        value: "India",
      }),
      true
    );
  });

  await t.test("valid navigate action", () => {
    assert.equal(
      validateAgentAction({
        type: "navigate",
        url: "https://example.com",
      }),
      true
    );
  });
});

test("validateAgentAction - invalid actions", async (t) => {
  await t.test("null action", () => {
    assert.equal(validateAgentAction(null), false);
  });

  await t.test("empty object action", () => {
    assert.equal(validateAgentAction({}), false);
  });

  await t.test("unsupported action type (executeScript)", () => {
    assert.equal(
      validateAgentAction({
        type: "executeScript",
        code: "alert(1)",
      }),
      false
    );
  });

  await t.test("navigate with dangerous javascript: protocol", () => {
    assert.equal(
      validateAgentAction({
        type: "navigate",
        url: "javascript:alert(1)",
      }),
      false
    );
  });

  await t.test("navigate with unauthorized file:/// protocol", () => {
    assert.equal(
      validateAgentAction({
        type: "navigate",
        url: "file:///etc/passwd",
      }),
      false
    );
  });

  await t.test("scroll with invalid direction", () => {
    assert.equal(
      validateAgentAction({
        type: "scroll",
        direction: "sideways",
        amount: 100,
      }),
      false
    );
  });

  await t.test("scroll with negative amount", () => {
    assert.equal(
      validateAgentAction({
        type: "scroll",
        direction: "down",
        amount: -100,
      }),
      false
    );
  });

  await t.test("click with empty elementId", () => {
    assert.equal(
      validateAgentAction({
        type: "click",
        target: { elementId: "" },
      }),
      false
    );
  });

  await t.test("click with non-numeric coordinates", () => {
    assert.equal(
      validateAgentAction({
        type: "click",
        target: { x: "100", y: 200 },
      }),
      false
    );
  });
});
