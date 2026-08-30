import assert from "node:assert/strict";
import test from "node:test";

import { getVietnameseGuidance } from "../dist/knowledge/index.js";
import { curatedVietnameseRules } from "../dist/knowledge/rules.vi.js";
import { normalizeAxeResults } from "../dist/normalize.js";

const metadata = {
  submittedUrl: "https://example.test/page",
  finalUrl: "https://example.test/page",
  documentTitle: "Knowledge fixture",
  scannedAt: "2026-08-14T10:00:00.000Z",
  durationMs: 25,
};

test("curated records have unique matching IDs and non-empty Vietnamese fields", () => {
  const entries = Object.entries(curatedVietnameseRules);
  const ruleIds = entries.map(([, entry]) => entry.ruleId);

  assert.equal(entries.length, 12);
  assert.equal(new Set(ruleIds).size, entries.length);

  for (const [key, entry] of entries) {
    assert.equal(entry.ruleId, key);
    assert.ok(entry.title.trim());
    assert.ok(entry.explanation.trim());
    assert.ok(entry.whyItMatters.trim());
    assert.ok(entry.remediation.trim());

    if (entry.example !== undefined) {
      assert.ok(entry.example.trim());
    }
  }
});

// The registry currently curates these twelve rules. The list is written out
// rather than derived from curatedVietnameseRules so that a rule silently
// disappearing from the registry fails here instead of shrinking the loop
// below to nothing. The cost is that adding a rule means adding it here too --
// which is the intended trade, and #10 exercised it: html-lang-valid landed in
// the registry and this table caught the drift.
const curatedRuleIds = [
  "image-alt",
  "button-name",
  "label",
  "link-name",
  "document-title",
  "html-has-lang",
  "html-lang-valid",
  "color-contrast",
  "heading-order",
  "aria-command-name",
  "aria-input-field-name",
  "list",
];

const requiredTextFields = ["title", "explanation", "whyItMatters", "remediation"];

test("every curated rule resolves through the public lookup", () => {
  assert.deepEqual(
    Object.keys(curatedVietnameseRules).toSorted(),
    curatedRuleIds.toSorted(),
    "the curated registry and this table have drifted apart",
  );

  for (const ruleId of curatedRuleIds) {
    const entry = curatedVietnameseRules[ruleId];
    const guidance = getVietnameseGuidance(ruleId);

    assert.equal(guidance.status, "CURATED", `${ruleId} did not resolve as CURATED`);
    assert.equal(entry.ruleId, ruleId, `${ruleId} is registered under a mismatched key`);

    // Assert against the registered record rather than restating the
    // Vietnamese paragraphs here: this pins that the lookup returns every
    // required field, from that rule's own entry, without duplicating the
    // guidance text into the test.
    for (const field of requiredTextFields) {
      assert.equal(
        guidance[field],
        entry[field],
        `${ruleId}.${field} did not come from its own curated record`,
      );
      assert.ok(guidance[field].trim(), `${ruleId}.${field} is empty`);
    }

    assert.equal(
      "example" in guidance,
      entry.example !== undefined,
      `${ruleId} disagrees with its record on whether an example exists`,
    );
    if (entry.example !== undefined) {
      assert.equal(guidance.example, entry.example);
    }
  }
});

test("known rule returns curated Vietnamese guidance", () => {
  const guidance = getVietnameseGuidance("button-name");

  assert.equal(guidance.status, "CURATED");
  assert.match(guidance.title, /Nút/);
  assert.ok(guidance.remediation.length > 0);
});

test("html-lang-valid returns curated Vietnamese guidance", () => {
  const guidance = getVietnameseGuidance("html-lang-valid");

  assert.equal(guidance.status, "CURATED");
  assert.match(guidance.title, /ngôn ngữ/);
  assert.ok(guidance.remediation.includes("BCP 47"));
});

test("list guidance covers direct children and preserved listitem semantics", () => {
  const guidance = getVietnameseGuidance("list");

  assert.equal(guidance.status, "CURATED");
  assert.match(guidance.title, /Danh sách/);
  // The rule is about *direct* children specifically -- a list whose <li>s
  // contain wrappers is fine. The remediation has to say which one it means,
  // or it reads as "no wrappers anywhere".
  assert.ok(guidance.remediation.includes("con trực tiếp"));
  assert.ok(guidance.explanation.includes("<li>"));
  // A native <li> can still fail axe's list rule when another role, such as
  // button, replaces its listitem semantics. Keep that edge case actionable.
  assert.ok(guidance.explanation.includes("role khác ghi đè"));
  assert.ok(guidance.remediation.includes("<button>"));
});

test("unknown rule returns only the explicit unavailable state", () => {
  const guidance = getVietnameseGuidance("future-axe-rule");

  assert.deepEqual(guidance, { status: "UNAVAILABLE" });
  assert.equal("remediation" in guidance, false);
  assert.equal("example" in guidance, false);
});

test("normalization preserves supported and unsupported findings", () => {
  const report = normalizeAxeResults(
    {
      violations: [
        {
          id: "image-alt",
          impact: "critical",
          helpUrl: "https://dequeuniversity.com/rules/axe/image-alt",
          nodes: [{ target: ["img"] }],
        },
        {
          id: "unsupported-fixture-rule",
          impact: "moderate",
          help: "Authoritative axe help remains available",
          helpUrl: "https://example.test/axe-reference",
          nodes: [{ target: ["main"] }],
        },
      ],
    },
    metadata,
  );

  assert.equal(report.violations.length, 2);
  assert.equal(report.summary.violatedRuleCount, 2);
  assert.equal(report.summary.affectedElementCount, 2);
  assert.equal(report.violations[0].guidance.status, "CURATED");
  assert.deepEqual(report.violations[1], {
    ruleId: "unsupported-fixture-rule",
    impact: "moderate",
    help: "Authoritative axe help remains available",
    helpUrl: "https://example.test/axe-reference",
    wcagReferences: [],
    totalNodeCount: 1,
    nodes: [{ target: ["main"] }],
    guidance: { status: "UNAVAILABLE" },
  });
  assert.doesNotThrow(() => JSON.stringify(report));
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});
