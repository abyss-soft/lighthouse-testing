const test = require("node:test");
const assert = require("node:assert/strict");
const {
  appendAggregate,
  buildClickHouseRows,
  extractMetrics,
  getConfig,
  normalizeAmount,
  parsePlatforms,
  validateTargets,
} = require("./runner");

test("parses platform selection and defaults to both platforms", () => {
  assert.deepEqual(parsePlatforms(), ["desktop", "mobile"]);
  assert.deepEqual(parsePlatforms("all"), ["desktop", "mobile"]);
  assert.deepEqual(parsePlatforms("mobile"), ["mobile"]);
  assert.throws(() => parsePlatforms("tablet"), /Platform must be/);
});

test("validates page URLs and requires at least one target", () => {
  assert.deepEqual(validateTargets({ home: "https://example.com/" }), [
    ["home", "https://example.com/"],
  ]);
  assert.throws(() => validateTargets({}), /at least one page URL/);
  assert.throws(
    () => validateTargets({ home: "file:///tmp/page" }),
    /HTTP or HTTPS/
  );
});

test("uses safe defaults and validates opt-in ClickHouse settings", () => {
  assert.deepEqual(getConfig({}), {
    count: 2,
    timeout: 120_000,
    saveLogs: true,
    sendData: false,
    username: undefined,
    password: undefined,
    clickhouseUrl: undefined,
  });

  assert.throws(
    () => getConfig({ SENDDATA: "true" }),
    /Set USERNAMELOGIN and PASSWORDLOGIN/
  );
  assert.throws(
    () =>
      getConfig({
        SENDDATA: "true",
        USERNAMELOGIN: "user",
        PASSWORDLOGIN: "password",
      }),
    /Set CLICKHOUSE_URL/
  );
  assert.throws(
    () =>
      getConfig({
        SENDDATA: "true",
        USERNAMELOGIN: "user",
        PASSWORDLOGIN: "password",
        CLICKHOUSE_URL: "file:///tmp/clickhouse",
      }),
    /must use HTTP or HTTPS/
  );
});

test("rejects invalid run count and timeout", () => {
  assert.throws(() => getConfig({ COUNT_TESTING: "0" }), /COUNT_TESTING/);
  assert.throws(
    () => getConfig({ LIGHTHOUSE_TIMEOUT_MS: "-1" }),
    /LIGHTHOUSE_TIMEOUT_MS/
  );
});

test("extracts available Lighthouse metrics and skips removed audits", () => {
  const metrics = extractMetrics({
    categories: { performance: { score: 0.936 } },
    audits: {
      "first-contentful-paint": { displayValue: "1.2 s" },
      "speed-index": { displayValue: "2.1 s" },
      "largest-contentful-paint": { displayValue: "2.4 s" },
      "total-blocking-time": { displayValue: "120 ms" },
      "cumulative-layout-shift": { displayValue: "0.02" },
    },
  });
  assert.deepEqual(metrics, {
    Performance: 94,
    "First-Contentful-Paint": "1.2 s",
    "Speed-Index": "2.1 s",
    "Largest-Contentful-Paint": "2.4 s",
    "Total-Blocking-Time": "120 ms",
    "Cumulative-Layout-Shift": "0.02",
  });
  assert.throws(
    () => extractMetrics({ categories: {}, audits: {} }),
    /no performance score/
  );
});

test("aggregates runs without losing URLs or measurement history", () => {
  const aggregate = {};
  appendAggregate(aggregate, "home", "https://example.com/", {
    Performance: 90,
  });
  appendAggregate(aggregate, "home", "https://example.com/", {
    Performance: 95,
  });
  assert.deepEqual(aggregate.home, {
    data: { Performance: [90, 95] },
    url: "https://example.com/",
  });
  assert.throws(
    () => appendAggregate(aggregate, "home", "https://other.example/", {}),
    /URL for "home" changed/
  );
});

test("builds ClickHouse rows with legacy-compatible fields", () => {
  const rows = buildClickHouseRows(
    "home",
    "https://example.com/",
    "mobile",
    { Performance: 92, "First-Contentful-Paint": "1,200 ms" },
    2,
    1_700_000_000
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], {
    timestamp: 1_700_000_000,
    name: "home",
    platform: "mobile",
    measurement: "First-Contentful-Paint",
    idx: 2,
    amount: "1200",
    url: "https://example.com/",
    instrument: "v1",
  });
});

test("normalizes metric values with units without stripping other letters", () => {
  assert.equal(normalizeAmount(" 1,234 ms "), "1234");
  assert.equal(normalizeAmount("1.2 s"), "1.2");
  assert.equal(normalizeAmount("First paint"), "First paint");
});
