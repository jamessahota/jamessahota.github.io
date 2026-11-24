import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = {};
new Function("window", readFileSync(new URL("../public/cargo-desk/share.js", import.meta.url), "utf8"))(page);
const { lines, marketLink, readMarketLink } = page.CargoShare;

test("shared seed links preserve long seeds and URL punctuation", () => {
  const seed = "WTI + Gulf & calendar? #carry / ⛽".padEnd(64, "x");
  const url = new URL(marketLink({ seed }));
  assert.equal(url.origin + url.pathname, "https://jsahota.com/projects/cargo-desk/");
  assert.equal(url.hash, "");
  assert.deepEqual(readMarketLink(url.search), { seed });
});

test("historical results link by scenario and weekly results link by practice seed", () => {
  const scenario = "harvey2017";
  const historical = new URL(marketLink({ scenario, seed: "scenario-" + scenario }));
  assert.deepEqual([...historical.searchParams], [["scenario", scenario]]);
  assert.deepEqual(readMarketLink(historical.search), { scenario });

  const seed = "weekly-v1:2026-11-23";
  const weekly = new URL(marketLink({ seed }));
  assert.deepEqual(readMarketLink(weekly.search), { seed });
});

test("missing, duplicate, conflicting and oversized replay targets leave the saved run alone", () => {
  for (const search of ["", "?seed=", "?seed=+", "?scenario=", "?seed=one&seed=two",
    "?scenario=harvey2017&scenario=opec2014", "?seed=one&scenario=harvey2017",
    "?seed=split%0Aline", "?seed=" + "a".repeat(65)]) {
    assert.equal(readMarketLink(search), null, search);
  }
});

test("copied results include drawdown and a replay link", () => {
  const result = { kind: "Practice market", net: 1725, grade: "A", drawdown: 23456,
    benchmark: null, seed: "tank test", days: [2000, -275, 0] };
  const link = marketLink(result);
  assert.equal(lines(result).split("\n").find(line => line.includes("drawdown")), "Largest fall (drawdown) $235");
  assert.ok(lines(result).endsWith("Play this market: " + link));
  assert.ok(!lines(result, false).includes(link), "native sharing supplies the URL independently");
});
