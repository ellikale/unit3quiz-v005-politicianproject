# Warehouse & Retail Transparency Portal

React + Vite single-page experience that:

- Loads `Warehouse_and_Retail_Sales.csv` from `/public` and lets you filter by year, item type, and supplier.
- Aggregates retail sales, transfers, and warehouse sales per month and renders a modern line chart.
- Includes a “Statement of Intent” supporter form wired for Firebase Authentication (email/password).

## Getting started

1) Install dependencies  
`npm install`

2) Run locally  
`npm run dev`

3) Firebase setup (required for registration form)  
Create `.env.local` with your project keys:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

The CSV is served from `/public/Warehouse_and_Retail_Sales.csv`; replace it if you want to swap datasets.
