# Clearance

A single-file debt payoff planner. No accounts, no server — your data stays in your browser.

**Live:** [clearance.stochastic-engine.com](https://clearance.stochastic-engine.com)

## Features

- Track income, fixed bills, and debt accounts (credit cards, loans, 0% APR)
- Bill dropoff scheduling — mark bills that end at a specific month
- Projection slider — scrub 1–36 months into the future to see how your cash flow changes as bills drop off
- Amortization chart with per-account breakdown
- Unpayable debt detection — flags accounts where payments don't cover interest
- YAML import/export for data portability
- Light/dark/auto theme toggle
- Fully client-side — all data stored in localStorage

## Tech

Single HTML file. Vanilla JS. [Chart.js](https://www.chartjs.org/) for visualization. No build step, no dependencies to install.

## Usage

Open `index.html` in a browser, or visit the live site. Add your income, bills, and debts in the sidebar. The dashboard updates in real time.

### Import/Export

Export your data as a YAML file for backup. Import it on another browser or device.

```yaml
income: 5000

bills:
  - name: Rent
    amount: 1200
  - name: Phone
    amount: 65
    dropoff: 12

debts:
  - name: Visa
    type: cc
    balance: 3000
    apr: 24
    payment: 150
    color: '#ff4466'
```

## License

MIT
