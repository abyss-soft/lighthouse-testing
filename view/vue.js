let dataMobile = null;
let dataDesktop = null;

const mobileShow = (data) => {
  dataMobile = data;
};
const desktopShow = (data) => {
  dataDesktop = data;
};

let scriptMobile = document.createElement("script");
scriptMobile.src = `../log/all-log_mobile.json?callback=mobileShow`;
document.body.append(scriptMobile);

let scriptDesktop = document.createElement("script");
scriptDesktop.src = `../log/all-log_desktop.json?callback=desktopShow`;
document.body.append(scriptDesktop);

window.onload = () => {
  const { createApp } = Vue;
  const { createVuetify } = Vuetify;
  const vuetify = createVuetify();

  createApp({
    data() {
      return {
        dataMobile,
        dataDesktop,
        tab: null,
      };
    },
    computed: {
      sortDesktop() {
        if (!dataDesktop) return null;
        const ordered = Object.keys(dataDesktop)
          .sort()
          .reduce((obj, key) => {
            obj[key] = dataDesktop[key];
            return obj;
          }, {});
        return ordered;
      },
      sortMobile() {
        if (!dataMobile) return null;
        const ordered = Object.keys(dataMobile)
          .sort()
          .reduce((obj, key) => {
            obj[key] = dataMobile[key];
            return obj;
          }, {});
        return ordered;
      },
      tableSize() {
        let columnsTable = Object.keys(this.tableView);
        let rowTableT = Object.keys(this.tableView[columnsTable[0]]);
        let rowTable = Object.keys(
          this.tableView[columnsTable[0]][rowTableT[0]]
        );
        return [columnsTable.length, rowTable.length + 2];
      },
      tableView() {
        if (!dataMobile || !dataDesktop) return [];
        let result = {};
        for (const [titlePage, data] of Object.entries(dataMobile)) {
          for (const [metricName, value] of Object.entries(data.data)) {
            let resultMobile = {
              [metricName]: {
                [titlePage]: {
                  mobile: value,
                  url: data.url,
                },
              },
            };
            if (result[metricName]) {
              let tempMobile = Object.assign(
                result[metricName],
                resultMobile[metricName]
              );
              result[metricName] = tempMobile;
            } else {
              result = Object.assign(result, resultMobile);
            }
          }
        }

        for (const [titlePage, data] of Object.entries(dataDesktop)) {
          for (const [metricName, value] of Object.entries(data.data)) {
            let resultDesktop = {
              [metricName]: {
                [titlePage]: {
                  desktop: value,
                  url: data.url,
                },
              },
            };
            if (result[metricName]) {
              let tempMobile = Object.assign(
                result[metricName][titlePage],
                resultDesktop[metricName][titlePage]
              );
              result[metricName][titlePage] = tempMobile;
            } else {
              let tempMobile = Object.assign(
                result[metricName],
                resultDesktop[metricName]
              );
              result[metricName] = tempMobile;
            }
          }
        }
        return result;
      },
    },
    methods: {
      sortData(data) {
        if (!data) return [];
        const ordered = Object.keys(data)
          .sort()
          .reduce((obj, key) => {
            obj[key] = data[key];
            return obj;
          }, {});
        return ordered;
      },
      getAverage(numbers) {
        const sum = numbers.reduce((acc, number) => {
          return Number(acc) + Number(number);
        }, 0);
        const length = numbers.length;
        return sum / length;
      },
      getResultValue(value) {
        if (typeof value === "string") {
          return "";
        }
        let result = value;
        const valueAllMeasurements = value.join(", ");
        isDataOnlyNumber = value.join("").replace(/[\d.:]/g, "").length === 0;
        const numberAfterPoint = (num) =>
          num.toString().includes(".")
            ? num.toString().split(".").pop().length
            : 0;

        if (isDataOnlyNumber) {
          result = [
            this.getAverage(value).toFixed(numberAfterPoint(value)),
            valueAllMeasurements,
          ];
          return result;
        }
        //values contain both numbers and units
        const onlyNumber = value.map((item) => {
          return item
            .replace(/[ms s]/g, "")
            .trim()
            .replace(/[.,]/g, "");
        });

        return [
          Number(
            this.getAverage(onlyNumber).toFixed(numberAfterPoint(onlyNumber))
          ).toLocaleString(),
          valueAllMeasurements,
        ];
      },
      rowTable(data) {
        let rowTable = Object.keys(data[Object.keys(data)[0]]);
        return rowTable.length + 2;
      },
    },
  })
    .use(vuetify)
    .mount("#app");
};
