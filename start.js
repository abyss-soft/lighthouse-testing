const { exec } = require("child_process");
const { execSync } = require("child_process");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();
let isDeviceType = process.argv[2] || false;
let isStartupType = process.argv[3] || false;
const getURLlist = require("./url.js");
let countTesting = 2; // how many times to test, minimum is two
const instrument = "v1";
let timestamp = null;
let result = {};
const urlList = getURLlist.urlList;
console.log("isDeviceType: ", isDeviceType);
let isStartMobile = isDeviceType === "mobile";
const platform = isStartMobile ? "mobile" : "desktop";
if (countTesting < 2) countTesting = 2;

function startLighthouseTest(url, titleSection) {
  timestamp = Math.floor(Date.now() / 1000);
  for (let index = 1; index <= countTesting; index++) {
    // const nameLog = isStartMobile ? "mobile" : "desktop";
    const desktopParam = isStartMobile ? "" : " --preset=desktop";
    const logFileName = `./log/${titleSection.replace(
      /[ ]/g,
      "_"
    )}_report_${index}_${platform}.json`;
    let lighthouseParams = `lighthouse ${url} --only-categories=performance --output=json --output-path=${logFileName} ${desktopParam} --quiet --chrome-flags="--headless --disable-gpu --no-sandbox"`;

    if (process.env.USEASYNCWORK) {
      exec(lighthouseParams, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
        }
        parserLog(titleSection, logFileName, url, index, saveLogResult);
      });
    } else {
      try {
        execSync(lighthouseParams, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
          }
        });
        parserLog(titleSection, logFileName, url, index, saveLogResult);
      } catch (err) {
        console.log(err);
      }
    }
  }
}

function commulate(titleSection, key, dataValue) {
  let accum = [];
  accum.push(result[titleSection].data[key]);
  accum.push(dataValue);
  return accum.flat();
}

function removeSymbol(item) {
  return typeof item === "string"
    ? item.replace(/[ms]/g, "").replace(/[s]/g, "").replace(/[,]/g, "").trim()
    : item;
}

async function createDataForClickhouse(data) {
  const params = {
    query: "INSERT INTO lighthouse_result FORMAT JSONEachRow",
  };
  const encodedBase64Token = Buffer.from(
    `${process.env.USERNAMELOGIN}:${process.env.PASSWORDLOGIN}`
  ).toString("base64");
  const authorization = `Basic ${encodedBase64Token}`;
  try {
    const url = "http://stat-db-m.price.inf.tech:8123";
    const config = {
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      params: params,
    };

    const res = await axios
      .post(url, JSON.stringify(data), config)
      .then((res) => {
        // console.log(res);
      })
      .catch((err) => {
        if (err.response) {
          console.error(err.response);
        } else if (err.request) {
          console.error(err.request);
        } else {
          console.error(err);
        }
      });
  } catch (err) {
    console.error(err);
  }
}

async function parserLog(
  titleSection,
  logFileName,
  url,
  countTestingNaw,
  callback
) {
  fs.readFile(logFileName, (err, data) => {
    if (err) throw err;
    let dataFile = JSON.parse(data);
    if (result[titleSection]) {
      // accumulate result
      let FCP = commulate(
        titleSection,
        "First-Contentful-Paint",
        dataFile.audits["first-contentful-paint"].displayValue
      );

      let SI = commulate(
        titleSection,
        "Speed-Index",
        dataFile.audits["speed-index"].displayValue
      );

      let LCP = commulate(
        titleSection,
        "Largest-Contentful-Paint",
        dataFile.audits["largest-contentful-paint"].displayValue
      );

      let TTI = commulate(
        titleSection,
        "Time-to-Interactive",
        dataFile.audits["interactive"].displayValue
      );

      let TBT = commulate(
        titleSection,
        "Total-Blocking-Time",
        dataFile.audits["total-blocking-time"].displayValue
      );

      let CLS = commulate(
        titleSection,
        "Cumulative-Layout-Shift",
        dataFile.audits["cumulative-layout-shift"].displayValue
      );

      let PERFOMANCE = commulate(
        titleSection,
        "Performance",
        Math.round(Number(dataFile.categories.performance.score) * 100)
      );

      // save
      result[titleSection] = {
        data: {
          "First-Contentful-Paint": FCP,
          Performance: PERFOMANCE,
          "Speed-Index": SI,
          "Largest-Contentful-Paint": LCP,
          "Time-to-Interactive": TTI,
          "Total-Blocking-Time": TBT,
          "Cumulative-Layout-Shift": CLS,
        },
        url: url,
      };
    } else {
      result[titleSection] = {
        data: {
          "First-Contentful-Paint":
            dataFile.audits["first-contentful-paint"].displayValue,
          "Speed-Index": dataFile.audits["speed-index"].displayValue,
          "Largest-Contentful-Paint":
            dataFile.audits["largest-contentful-paint"].displayValue,
          "Time-to-Interactive": dataFile.audits["interactive"].displayValue,
          "Total-Blocking-Time":
            dataFile.audits["total-blocking-time"].displayValue,
          "Cumulative-Layout-Shift":
            dataFile.audits["cumulative-layout-shift"].displayValue,
          Performance: Math.round(
            Number(dataFile.categories.performance.score) * 100
          ),
        },
        url: url,
      };
    }
    createDataForClickhouse([
      {
        timestamp: timestamp,
        name: titleSection,
        platform: platform,
        measurement: "First-Contentful-Paint",
        idx: countTestingNaw,
        amount: removeSymbol(
          dataFile.audits["first-contentful-paint"].displayValue
        ),
        url: url,
        instrument: instrument,
      },
      {
        timestamp: timestamp,
        name: titleSection,
        platform: platform,
        measurement: "Speed-Index",
        idx: countTestingNaw,
        amount: removeSymbol(dataFile.audits["speed-index"].displayValue),
        url: url,
        instrument: instrument,
      },
      {
        timestamp: timestamp,
        name: titleSection,
        platform: platform,
        measurement: "Largest-Contentful-Paint",
        idx: countTestingNaw,
        amount: removeSymbol(
          dataFile.audits["largest-contentful-paint"].displayValue
        ),
        url: url,
        instrument: instrument,
      },
      {
        timestamp: timestamp,
        name: titleSection,
        platform: platform,
        measurement: "Time-to-Interactive",
        idx: countTestingNaw,
        amount: removeSymbol(dataFile.audits["interactive"].displayValue),
        url: url,
        instrument: instrument,
      },
      {
        timestamp: timestamp,
        name: titleSection,
        platform: platform,
        measurement: "Total-Blocking-Time",
        idx: countTestingNaw,
        amount: removeSymbol(
          dataFile.audits["total-blocking-time"].displayValue
        ),
        url: url,
        instrument: instrument,
      },
      {
        timestamp: timestamp,
        name: titleSection,
        platform: platform,
        measurement: "Cumulative-Layout-Shift",
        idx: countTestingNaw,
        amount: removeSymbol(
          dataFile.audits["cumulative-layout-shift"].displayValue
        ),
        url: url,
        instrument: instrument,
      },
      {
        timestamp: timestamp,
        name: titleSection,
        platform: platform,
        measurement: "Performance",
        idx: countTestingNaw,
        amount: removeSymbol(
          Math.round(Number(dataFile.categories.performance.score) * 100)
        ),
        url: url,
        instrument: instrument,
      },
    ]);
    callback();
  });
}

function saveLogResult() {
  const fileLog = isStartMobile
    ? `./log/all-log_mobile.json`
    : `./log/all-log_desktop.json`;

  const wrapperLog = isStartMobile ? `mobileShow` : `desktopShow`;
  fs.writeFileSync(fileLog, `${wrapperLog}(${JSON.stringify(result)})`);
}

fs.stat("log", function (err) {
  if (err?.code === "ENOENT") {
    fs.mkdir("log", (errLog) => {
      if (errLog) throw errLog;
      console.log("'Log' created");
    });
  }
  // Start test
  for (const [titleSection, url] of Object.entries(urlList)) {
    startLighthouseTest(url, titleSection, isStartMobile);
  }
});
