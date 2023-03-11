const {exec} = require("child_process");
const {execSync} = require('child_process');
const fs = require("fs");
let isDeviceType = process.argv[2] || false;
let isStartupType = process.argv[3] || false;
const getURLlist = require("./url.js");
let countTesting = 3; // how many times to test, minimum is two
let result = {};
const urlList = getURLlist.urlList;
console.log('isDeviceType: ', isDeviceType)
let isStartMobile = isDeviceType === "mobile";
if (countTesting < 2) countTesting = 2;

function startLighthouseTest(url, titleSection) {
    for (let index = 1; index <= countTesting; index++) {
        const nameLog = isStartMobile ? "mobile" : "desktop";
        const desktopParam = isStartMobile ? "" : " --preset=desktop";
        const logFileName = `./log/${titleSection.replace(
            /[ ]/g,
            "_"
        )}_report_${index}_${nameLog}.json`;
        let lighthouseParams = `lighthouse ${url} --only-categories=performance --output=json --output-path=${logFileName} ${desktopParam}`;

        if (isStartupType) {
            execSync(lighthouseParams, (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }
            });
            parserLog(titleSection, logFileName, url, saveLogResult);
        } else {
            exec(lighthouseParams, (error, stdout, stderr) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    return;
                }
                parserLog(titleSection, logFileName, url, saveLogResult);
            });
        }


    }
}

function commulate(titleSection, key, dataValue) {
    let accum = [];
    accum.push(result[titleSection].data[key]);
    accum.push(dataValue);
    return accum.flat();
}

async function parserLog(titleSection, logFileName, url, callback) {
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

// Start test
for (const [titleSection, url] of Object.entries(urlList)) {
    startLighthouseTest(url, titleSection, isStartMobile);
}
