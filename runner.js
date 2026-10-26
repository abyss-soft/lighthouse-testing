const fs = require("node:fs/promises");
const path = require("node:path");
const { urlList } = require("./url");

const instrument = "v1";
const logDirectory = path.join(__dirname, "log");
const defaultTimeout = 120_000;
const metricDefinitions = [
  ["first-contentful-paint", "First-Contentful-Paint"],
  ["speed-index", "Speed-Index"],
  ["largest-contentful-paint", "Largest-Contentful-Paint"],
  ["interactive", "Time-to-Interactive"],
  ["total-blocking-time", "Total-Blocking-Time"],
  ["cumulative-layout-shift", "Cumulative-Layout-Shift"],
];

function parsePositiveInteger(value, name, defaultValue) {
  if (value === undefined || value.trim() === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function isEnabled(value, defaultValue = false) {
  if (value === undefined || value.trim() === "") return defaultValue;
  return !["false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

function parsePlatforms(value) {
  if (!value || value === "all") return ["desktop", "mobile"];
  if (value === "desktop" || value === "mobile") return [value];
  throw new Error('Platform must be "desktop", "mobile", or "all".');
}

function getConfig(env = process.env) {
  const sendData = isEnabled(env.SENDDATA);
  const config = {
    count: parsePositiveInteger(env.COUNT_TESTING, "COUNT_TESTING", 2),
    timeout: parsePositiveInteger(
      env.LIGHTHOUSE_TIMEOUT_MS,
      "LIGHTHOUSE_TIMEOUT_MS",
      defaultTimeout
    ),
    saveLogs: isEnabled(env.SAVELOGS, true),
    sendData,
    username: env.USERNAMELOGIN,
    password: env.PASSWORDLOGIN,
    clickhouseUrl: env.CLICKHOUSE_URL,
  };

  if (sendData) {
    if (!config.username || !config.password) {
      throw new Error(
        "Set USERNAMELOGIN and PASSWORDLOGIN when SENDDATA is enabled."
      );
    }
    if (!config.clickhouseUrl) {
      throw new Error(
        "Set CLICKHOUSE_URL when SENDDATA is enabled; there is no built-in endpoint."
      );
    }
    let endpoint;
    try {
      endpoint = new URL(config.clickhouseUrl);
    } catch {
      throw new Error("CLICKHOUSE_URL must be a valid HTTP or HTTPS URL.");
    }
    if (!["http:", "https:"].includes(endpoint.protocol)) {
      throw new Error("CLICKHOUSE_URL must use HTTP or HTTPS.");
    }
  }

  return config;
}

function validateTargets(targets) {
  const entries = Object.entries(targets);
  if (entries.length === 0) {
    throw new Error("Add at least one page URL to url.js before running Lighthouse.");
  }

  for (const [name, value] of entries) {
    let parsedUrl;
    try {
      parsedUrl = new URL(value);
    } catch {
      throw new Error(`Invalid URL configured for "${name}".`);
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(`URL for "${name}" must use HTTP or HTTPS.`);
    }
  }
  return entries;
}

function sanitizeFileName(value) {
  const name = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (!name || name === "." || name === "..") {
    throw new Error("Page names in url.js must contain letters or numbers.");
  }
  return name;
}

function normalizeAmount(value) {
  if (typeof value !== "string") return value;
  return value
    .trim()
    .replace(/,/g, "")
    .replace(/\s*(?:ms|s)$/i, "")
    .trim();
}

function extractMetrics(report) {
  const score = report.categories?.performance?.score;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    throw new Error("Lighthouse report has no performance score.");
  }

  const data = {
    Performance: Math.round(score * 100),
  };
  for (const [auditId, metricName] of metricDefinitions) {
    const value = report.audits?.[auditId]?.displayValue;
    if (typeof value === "string" && value.trim()) {
      data[metricName] = value;
    }
  }
  return data;
}

function appendAggregate(aggregate, name, url, metrics) {
  const page = aggregate[name] || { data: {}, url };
  if (page.url !== url) {
    throw new Error(`URL for "${name}" changed during the run.`);
  }

  for (const [metric, value] of Object.entries(metrics)) {
    if (!page.data[metric]) page.data[metric] = [];
    page.data[metric].push(value);
  }
  aggregate[name] = page;
}

function buildClickHouseRows(name, url, platform, metrics, index, timestamp) {
  return Object.entries(metrics).map(([measurement, value]) => ({
    timestamp,
    name,
    platform,
    measurement,
    idx: index,
    amount: normalizeAmount(value),
    url,
    instrument,
  }));
}

async function runLighthouse(url, platform, timeout) {
  const chromeLauncherModule = await import("chrome-launcher");
  const chromeLauncher =
    chromeLauncherModule.default || chromeLauncherModule;
  const lighthouseModule = await import("lighthouse");
  const lighthouse = lighthouseModule.default || lighthouseModule.lighthouse;
  if (typeof lighthouse !== "function") {
    throw new Error("The installed Lighthouse package has no runner export.");
  }
  if (typeof chromeLauncher.launch !== "function") {
    throw new Error("The installed Chrome launcher has no launch function.");
  }

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless"],
  });

  const flags = {
    port: chrome.port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance"],
    formFactor: platform,
    screenEmulation:
      platform === "mobile"
        ? {
            mobile: true,
            width: 412,
            height: 823,
            deviceScaleFactor: 1.75,
            disabled: false,
          }
        : {
            mobile: false,
            width: 1350,
            height: 940,
            deviceScaleFactor: 1,
            disabled: false,
          },
    maxWaitForLoad: timeout,
  };
  if (platform === "desktop") flags.preset = "desktop";

  try {
    const result = await lighthouse(url, flags);
    if (!result?.lhr) {
      throw new Error(`Lighthouse returned no ${platform} report.`);
    }
    return result.lhr;
  } finally {
    await chrome.kill();
  }
}

async function saveReport(name, index, platform, report) {
  await fs.mkdir(logDirectory, { recursive: true });
  const fileName = `${sanitizeFileName(name)}_report_${index}_${platform}.json`;
  await fs.writeFile(
    path.join(logDirectory, fileName),
    `${JSON.stringify(report)}\n`,
    "utf8"
  );
}

async function saveAggregate(platform, aggregate) {
  await fs.mkdir(logDirectory, { recursive: true });
  const callback = platform === "mobile" ? "mobileShow" : "desktopShow";
  const fileName = `all-log_${platform}.json`;
  await fs.writeFile(
    path.join(logDirectory, fileName),
    `${callback}(${JSON.stringify(aggregate)})\n`,
    "utf8"
  );
}

async function sendResults(rows, config) {
  const endpoint = new URL(config.clickhouseUrl);
  endpoint.searchParams.set(
    "query",
    "INSERT INTO lighthouse_result FORMAT JSONEachRow"
  );
  const authorization = Buffer.from(
    `${config.username}:${config.password}`
  ).toString("base64");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
    },
    body: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new Error(
      `ClickHouse returned HTTP ${response.status}: ${message || response.statusText}`
    );
  }
}

async function runMonitoring(options = {}) {
  const config = options.config || getConfig();
  const platforms = parsePlatforms(options.platform);
  const targets = validateTargets(options.targets || urlList);
  const aggregateByPlatform = Object.fromEntries(
    platforms.map((platform) => [platform, {}])
  );
  const timestamp = Math.floor(Date.now() / 1000);
  let failures = 0;

  for (const platform of platforms) {
    for (const [name, url] of targets) {
      for (let index = 1; index <= config.count; index += 1) {
        try {
          const report = await runLighthouse(url, platform, config.timeout);
          const metrics = extractMetrics(report);
          appendAggregate(
            aggregateByPlatform[platform],
            name,
            url,
            metrics
          );

          if (config.saveLogs) {
            await saveReport(name, index, platform, report);
          }
          if (config.sendData) {
            await sendResults(
              buildClickHouseRows(name, url, platform, metrics, index, timestamp),
              config
            );
          }
          console.log(
            `Completed ${name} (${platform}, measurement ${index}/${config.count}).`
          );
        } catch (error) {
          failures += 1;
          console.error(
            `Failed ${name} (${platform}, measurement ${index}): ${error.message}`
          );
        }
      }
    }

    if (config.saveLogs) {
      await saveAggregate(platform, aggregateByPlatform[platform]);
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} Lighthouse measurement(s) failed.`);
  }
}

if (require.main === module) {
  require("dotenv").config();
  runMonitoring({ platform: process.argv[2] }).catch((error) => {
    console.error(`Lighthouse run stopped: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  appendAggregate,
  buildClickHouseRows,
  extractMetrics,
  getConfig,
  normalizeAmount,
  parsePlatforms,
  runLighthouse,
  runMonitoring,
  validateTargets,
};
