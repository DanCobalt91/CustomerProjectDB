# CustomerProjectDB

A lightweight React + TypeScript app (Vite) to manage customers, projects, WOs, and POs with notes. Data persists in `localStorage`.

## Features
- Index search by **Customer name** (type or pick), **Project number**, **WO number**
- Customer page with editable **address / contact name / phone / email**
- Projects list with collapsible rows
- **Add/Delete/Copy** Work Orders (Build/Onsite) — each WO can have an optional note
- **Add/Delete/Copy** Purchase Orders — each can have an optional note
- Add new projects and create new customers
- Reset demo data

## Stack
- React 18 + TypeScript
- Vite
- Tailwind CSS
- framer-motion (simple expand/collapse animation)
- lucide-react (icons)

## Getting Started
```bash
npm install
npm run dev
```
Open http://localhost:5173

## Build
```bash
npm run build
npm run preview
```

## Data
All data is stored in the browser `localStorage` under key `customer-project-db` (older `cpdb.v1` data is migrated automatically).
Clearing browser storage resets the demo database.

## Troubleshooting

### "Unable to read field 'customerProjectId' from Storage"

CustomerProjectDB keeps its demo workspace in your browser's `localStorage`. If that data is missing the active project record, any upload that relies on it (for example, project documents or sign-off PDFs) will fail with this error. Open **Settings → Data** and clear/import fresh workspace data or clear the browser storage before trying again.


## GitHub Setup

1. Create a new repo on GitHub called **CustomerProjectDB** (no README, no gitignore — we'll push ours).
2. In the project folder, run:
   ```bash
   git init
   git add .
   git commit -m "chore: bootstrap CustomerProjectDB (Vite + React + TS)"
   git branch -M main
   git remote add origin https://github.com/<your-user>/CustomerProjectDB.git
   git push -u origin main
   ```

### CI (GitHub Actions)
This repo includes `.github/workflows/ci.yml` which builds the app on pushes/PRs to `main` and uploads the `dist/` artifact.

### Deploy (GitHub Pages)
To deploy on GitHub Pages:
1. Install the plugin:
   ```bash
   npm i -D gh-pages
   ```
2. Add to `package.json` scripts:
   ```json
   "deploy": "gh-pages -d dist"
   ```
3. Build & deploy:
   ```bash
   npm run build
   npm run deploy
   ```
Then enable Pages in the repo settings to serve from `gh-pages` branch.
