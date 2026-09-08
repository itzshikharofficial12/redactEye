import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import type { DOMSnapshot, DOMElement } from "@redact-eye/shared-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

const FIXTURE_NAMES = ["login-page", "signup-page", "profile-page"] as const;

function loadFixture(name: string) {
  const imgPath = path.join(repoRoot, `test-fixtures/screenshots/${name}.jpg`);
  const domPath = path.join(repoRoot, `test-fixtures/dom/${name}.json`);

  assert.ok(fs.existsSync(imgPath), `Screenshot missing: ${imgPath}`);
  assert.ok(fs.existsSync(domPath), `DOM snapshot missing: ${domPath}`);

  const imgBuf = fs.readFileSync(imgPath);
  const rawImage = jpeg.decode(imgBuf);
  const dom: DOMSnapshot = JSON.parse(fs.readFileSync(domPath, "utf-8"));

  return { rawImage, dom };
}

test("Test-Fixture Screenshot <-> DOM Alignment (@redact-eye/vision-engine)", async (t) => {
  for (const name of FIXTURE_NAMES) {
    await t.test(`${name}: screenshot pixel dimensions and DOM documentWidth/Height match exactly`, () => {
      const { rawImage, dom } = loadFixture(name);

      // 1. Screenshot must be 1376x768
      assert.equal(
        rawImage.width,
        1376,
        `${name}.jpg actual width must be 1376px (got ${rawImage.width})`
      );
      assert.equal(
        rawImage.height,
        768,
        `${name}.jpg actual height must be 768px (got ${rawImage.height})`
      );

      // 2. Matching DOM snapshot documentWidth/Height must match screenshot dimensions
      assert.equal(
        dom.documentWidth,
        rawImage.width,
        `${name}.json documentWidth (${dom.documentWidth}) must match screenshot width (${rawImage.width})`
      );
      assert.equal(
        dom.documentHeight,
        rawImage.height,
        `${name}.json documentHeight (${dom.documentHeight}) must match screenshot height (${rawImage.height})`
      );
    });

    await t.test(`${name}: all DOM bounding boxes are valid and strictly within screenshot bounds`, () => {
      const { rawImage, dom } = loadFixture(name);

      for (const el of dom.elements) {
        const { x, y, width, height } = el.bbox;
        assert.ok(x >= 0, `[${el.id}] x (${x}) must be >= 0`);
        assert.ok(y >= 0, `[${el.id}] y (${y}) must be >= 0`);
        assert.ok(width > 0, `[${el.id}] width (${width}) must be > 0`);
        assert.ok(height > 0, `[${el.id}] height (${height}) must be > 0`);
        assert.ok(
          x + width <= rawImage.width,
          `[${el.id}] x + width (${x + width}) exceeds screenshot width (${rawImage.width})`
        );
        assert.ok(
          y + height <= rawImage.height,
          `[${el.id}] y + height (${y + height}) exceeds screenshot height (${rawImage.height})`
        );
      }
    });
  }

  await t.test("login-page: important elements occupy sensible positions in screenshot coordinates", () => {
    const { rawImage, dom } = loadFixture("login-page");
    const elMap = new Map<string, DOMElement>(dom.elements.map((e) => [e.id, e]));

    // Centered content: center axis of card elements must be near 688 (1376 / 2)
    const centeredIds = ["image_1", "text_1", "input_1", "input_2", "button_1"];
    for (const id of centeredIds) {
      const el = elMap.get(id);
      assert.ok(el, `Element ${id} must exist in login-page`);
      const centerX = el.bbox.x + el.bbox.width / 2;
      assert.ok(
        centerX >= 660 && centerX <= 716,
        `[${id}] center X (${centerX}) must align with screenshot center ~688 (range 660..716)`
      );
    }

    // Vertical layout hierarchy:
    const avatar = elMap.get("image_1")!;
    const title = elMap.get("text_1")!;
    const emailLabel = elMap.get("text_2")!;
    const emailInput = elMap.get("input_1")!;
    const passLabel = elMap.get("text_3")!;
    const passInput = elMap.get("input_2")!;
    const loginBtn = elMap.get("button_1")!;

    assert.ok(avatar.bbox.y + avatar.bbox.height <= title.bbox.y + 30, "Avatar must be above title");
    assert.ok(emailInput.bbox.y >= emailLabel.bbox.y + emailLabel.bbox.height, "Email input must be below email label");
    assert.ok(passInput.bbox.y >= passLabel.bbox.y + passLabel.bbox.height, "Password input must be below password label");
    assert.ok(loginBtn.bbox.y >= passInput.bbox.y + passInput.bbox.height, "Login button must be below password input");
  });

  await t.test("signup-page: important elements occupy sensible positions in screenshot coordinates", () => {
    const { dom } = loadFixture("signup-page");
    const elMap = new Map<string, DOMElement>(dom.elements.map((e) => [e.id, e]));

    // Centered form: title, inputs, button centered around 688
    const centeredIds = ["text_1", "input_1", "input_2", "input_3", "input_4", "button_1"];
    for (const id of centeredIds) {
      const el = elMap.get(id);
      assert.ok(el, `Element ${id} must exist in signup-page`);
      const centerX = el.bbox.x + el.bbox.width / 2;
      assert.ok(
        centerX >= 660 && centerX <= 716,
        `[${id}] center X (${centerX}) must align with screenshot center ~688 (range 660..716)`
      );
    }

    // Inputs must be strictly below their respective labels
    const nameLabel = elMap.get("text_2")!;
    const nameInput = elMap.get("input_1")!;
    const emailLabel = elMap.get("text_3")!;
    const emailInput = elMap.get("input_2")!;
    const phoneLabel = elMap.get("text_4")!;
    const phoneInput = elMap.get("input_3")!;
    const passLabel = elMap.get("text_5")!;
    const passInput = elMap.get("input_4")!;

    assert.ok(nameInput.bbox.y >= nameLabel.bbox.y + nameLabel.bbox.height, "Name input must be below name label");
    assert.ok(emailInput.bbox.y >= emailLabel.bbox.y + emailLabel.bbox.height, "Email input must be below email label");
    assert.ok(phoneInput.bbox.y >= phoneLabel.bbox.y + phoneLabel.bbox.height, "Phone input must be below phone label");
    assert.ok(passInput.bbox.y >= passLabel.bbox.y + passLabel.bbox.height, "Password input must be below password label");
  });

  await t.test("profile-page: important elements occupy sensible positions in screenshot coordinates", () => {
    const { rawImage, dom } = loadFixture("profile-page");
    const elMap = new Map<string, DOMElement>(dom.elements.map((e) => [e.id, e]));

    // Navbar
    const navbar = elMap.get("container_1")!;
    const brand = elMap.get("text_1")!;
    const logout = elMap.get("button_1")!;

    assert.equal(navbar.bbox.x, 0, "Navbar must start at x=0");
    assert.equal(navbar.bbox.width, rawImage.width, `Navbar must span full width (${rawImage.width})`);
    assert.ok(brand.bbox.x < 100, `Brand logo must be on the left (got x=${brand.bbox.x})`);
    assert.ok(logout.bbox.x >= 1200, `Logout button must be on the right (x >= 1200, got ${logout.bbox.x})`);

    // Profile card centered elements
    const avatar = elMap.get("image_1")!;
    const name = elMap.get("text_2")!;
    for (const el of [avatar, name]) {
      const centerX = el.bbox.x + el.bbox.width / 2;
      assert.ok(
        centerX >= 660 && centerX <= 716,
        `[${el.id}] center X (${centerX}) must align with screenshot center ~688`
      );
    }

    // Two-column metadata table inside white card (card spans ~478..897)
    const labelIds = ["text_3", "text_5", "text_7", "text_9"];
    const valueIds = ["text_4", "text_6", "text_8", "text_10"];

    for (let i = 0; i < labelIds.length; i++) {
      const lbl = elMap.get(labelIds[i]!)!;
      const val = elMap.get(valueIds[i]!)!;

      assert.ok(lbl.bbox.x >= 470 && lbl.bbox.x < 600, `[${lbl.id}] label must be in left column 470..600 (got ${lbl.bbox.x})`);
      assert.ok(val.bbox.x >= 600 && val.bbox.x <= 900, `[${val.id}] value must be in right column 600..900 (got ${val.bbox.x})`);
      assert.ok(
        val.bbox.x >= lbl.bbox.x + lbl.bbox.width,
        `[${val.id}] value must be positioned to the right of [${lbl.id}] label without overlap`
      );
    }

    // Action buttons inside card
    const editBtn = elMap.get("button_2")!;
    const deleteBtn = elMap.get("button_3")!;
    assert.ok(editBtn.bbox.x >= 470, `Edit Profile button must be inside card x >= 470 (got ${editBtn.bbox.x})`);
    assert.ok(
      deleteBtn.bbox.x >= editBtn.bbox.x + editBtn.bbox.width,
      "Delete button must be to the right of Edit button"
    );
  });
});
