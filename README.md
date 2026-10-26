# Lighthouse testing

Run repeatable local Lighthouse performance audits for the pages configured in
`url.js`. Each audit saves a full Lighthouse JSON report and updates the
mobile or desktop dashboard data in `log/`.

## Requirements

- Node.js 22.19 or newer
- npm
- Chrome or Chromium available to Lighthouse

## Setup

```sh
npm install
cp .env.example .env
```

Edit `url.js` to add, remove, or replace the pages you want to audit. Only test
pages you are permitted to measure. Configure repetitions with
`COUNT_TESTING`.

## Run

```sh
npm start
npm run start:desktop
npm run start:mobile
npm test
```

`npm start` runs desktop then mobile audits sequentially. Each platform can
also be run separately. Sequential measurements avoid opening many browser
instances at once. If an audit fails, the error is reported and the process
exits with a non-zero status after the remaining configured audits finish.

## Results

Full reports are saved as
`log/<page>_report_<run>_<platform>.json`. The dashboard summaries are
`log/all-log_desktop.json` and `log/all-log_mobile.json`; open
`view/index.html` to review them.

ClickHouse export is disabled by default. To enable it, set `SENDDATA=true` in
`.env`, then replace the example `CLICKHOUSE_URL`, `USERNAMELOGIN`, and
`PASSWORDLOGIN` with your own values. There is no built-in server address.
