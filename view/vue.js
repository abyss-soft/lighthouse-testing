function loadJsonp(filePath, callbackName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let receivedData = false;

    window[callbackName] = (data) => {
      receivedData = true;
      resolve(data);
    };

    script.src = filePath;
    script.async = true;
    script.onload = () => {
      if (!receivedData) {
        reject(new Error(`Файл ${filePath} не вызвал ожидаемый callback.`));
      }
      delete window[callbackName];
      script.remove();
    };
    script.onerror = () => {
      delete window[callbackName];
      script.remove();
      reject(
        new Error(
          `Не удалось открыть ${filePath}. Убедитесь, что файл существует и страница открыта через локальный сервер.`
        )
      );
    };

    document.head.append(script);
  });
}

function normalizePageData(data, label) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Файл ${label} содержит данные неверного формата.`);
  }

  for (const [name, page] of Object.entries(data)) {
    if (
      !page ||
      typeof page.url !== "string" ||
      !page.data ||
      typeof page.data !== "object" ||
      Array.isArray(page.data)
    ) {
      throw new Error(`Повреждены данные страницы «${name}» (${label}).`);
    }
  }

  return data;
}

const { createApp } = Vue;

createApp({
  data() {
    return {
      mobileData: {},
      desktopData: {},
      loading: true,
      error: "",
      view: "overview",
      platforms: [
        { key: "mobile", label: "Мобильная версия" },
        { key: "desktop", label: "Десктопная версия" },
      ],
    };
  },
  computed: {
    pageNames() {
      return [
        ...new Set([
          ...Object.keys(this.mobileData),
          ...Object.keys(this.desktopData),
        ]),
      ].sort((first, second) => first.localeCompare(second));
    },
    metricNames() {
      const names = new Set();
      for (const pages of [this.mobileData, this.desktopData]) {
        for (const page of Object.values(pages)) {
          for (const metric of Object.keys(page.data)) names.add(metric);
        }
      }
      return [...names].sort((first, second) => {
        if (first === "Performance") return -1;
        if (second === "Performance") return 1;
        return first.localeCompare(second);
      });
    },
  },
  methods: {
    async loadData() {
      this.loading = true;
      this.error = "";
      try {
        const [mobileData, desktopData] = await Promise.all([
          loadJsonp("../log/all-log_mobile.json", "mobileShow"),
          loadJsonp("../log/all-log_desktop.json", "desktopShow"),
        ]);
        this.mobileData = normalizePageData(mobileData, "mobile");
        this.desktopData = normalizePageData(desktopData, "desktop");
      } catch (error) {
        this.error = error.message;
      } finally {
        this.loading = false;
      }
    },
    platformData(platform) {
      return platform === "mobile" ? this.mobileData : this.desktopData;
    },
    sortedPages(pages) {
      return Object.fromEntries(
        Object.entries(pages).sort(([first], [second]) =>
          first.localeCompare(second)
        )
      );
    },
    samples(value) {
      return Array.isArray(value) ? value : [value];
    },
    average(value, metric) {
      const values = this.samples(value)
        .map((sample) => {
          const normalized = String(sample)
            .replace(/\u00a0/g, " ")
            .replace(/,/g, "")
            .trim();
          const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(ms|s)?$/i);
          if (!match) return null;

          const number = Number(match[1]);
          if (!Number.isFinite(number)) return null;
          return {
            number: match[2]?.toLowerCase() === "s" ? number * 1000 : number,
            unit: match[2]?.toLowerCase() || "",
          };
        })
        .filter(Boolean);

      if (!values.length) return "—";

      const mean =
        values.reduce((sum, item) => sum + item.number, 0) / values.length;
      if (values.some((item) => item.unit === "s" || item.unit === "ms")) {
        if (Math.abs(mean) >= 1000) {
          return `${this.formatNumber(mean / 1000)} s`;
        }
        return `${this.formatNumber(mean)} ms`;
      }

      return metric === "Performance"
        ? String(Math.round(mean))
        : this.formatNumber(mean);
    },
    formatNumber(value) {
      return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 2,
      }).format(value);
    },
    safeUrl(value) {
      try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
      } catch {
        return null;
      }
    },
  },
  mounted() {
    this.loadData();
  },
}).mount("#app");
