# My Ghoulection

A Windows desktop app for cataloging a Monster High doll collection.

- **Collection**: character, release, line, year, generation, SKU, condition, included extras, photos, price paid, where/when bought, estimated value, and totals.
- **Wishlist**: dolls you're hunting, with priority and a target price.
- **Catalog**: every Monster High release (about 830 dolls, plus fashion packs, playsets and figures), grouped by series, from [MHcollector.com](https://mhcollector.com/). Search and filter it, see what you're missing, and add any doll to your collection or wishlist with one click (it fills in character, series, year, model number, generation and a photo).
- **Retail price (MSRP)**: every doll keeps its MSRP, and "price paid" defaults to it. Mattel Creations releases use the real price; catalog dolls use a typical retail price for that kind of release (basic, budget, fashion pack, multi-pack, playset, collector), labelled *estimate* until you type the real one.
- **Value check**: click the *Estimated value* card to work through your collection. Each doll gets an **eBay sold** button that opens recently sold listings for that doll, filtered by its condition (New for NRFB/NIB, Used for loose). Type the typical price and the totals update. (eBay doesn't allow apps to read sold listings, so you read them and the app does the rest.)
- **Coming Soon**: checks Mattel Creations for upcoming Monster High drops, with live countdowns, a desktop notification when a drop goes live, and one-click "add to wishlist".
- **Export** to a CSV spreadsheet; **Data folder** opens where the database and photos live (back this folder up).

## Running it

```
npm install
npm start        # build the interface and open the app
npm run dev      # development mode with hot reload
npm run dist     # build a Windows installer into release/
```

## Updates

The **Check for updates** button (top right) looks for a newer release at
[github.com/Geekincognito77/my-ghoulection/releases](https://github.com/Geekincognito77/my-ghoulection/releases),
downloads it, and installs it on restart. The app also checks quietly a few seconds after it opens. Your collection is never touched by an update.

To publish a new version:

1. Change `"version"` in `package.json` (for example `0.3.0` → `0.4.0`) and commit your changes.
2. Run `npm run release -- "Short description of what changed"`.

That builds the installer, pushes to GitHub, and creates the release with the files the updater needs (`latest.yml`, the installer and its `.blockmap`).

## How it's built (and how to port it to the web)

- `electron/` is the desktop shell: `store.cjs` (SQLite via Node's built-in `node:sqlite`, plus the photos folder), `releases.cjs` (Mattel Creations checker), `main.cjs` and `preload.cjs`.
- `src/` is a React app that only talks to the outside world through `src/api.js`.

To make a web version, keep `src/` as is, move `store.cjs`/`releases.cjs` behind a small HTTP server, and fill in the web branch of `src/api.js` with `fetch()` calls.

Data lives in `%APPDATA%\My Ghoulection\` (`ghoulection.db`, `photos\`, `releases-cache.json`).

## How the Catalog works

The app downloads MHcollector's public Checklist page (one request) and keeps the list in the local database, refreshing it weekly or when you press **Update catalog**. A doll's full details and photo are fetched only when you open or add it, then cached. All requests to mhcollector.com are spaced at least 3 seconds apart, as its robots.txt asks, so adding a doll takes a few seconds. Catalog data and photos belong to MHcollector.com; each entry links back to its page there.

## How Coming Soon works

The app reads the public Monster High product feed on creations.mattel.com, then opens the product page of each recent not-yet-buyable item to read its launch time (the same value that drives the site's own countdown). It only knows about drops Mattel has already posted to the site. Results are cached and refreshed every 3 hours or when you press **Check now**.
