# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GEWA is a static widget distribution system providing two iframe-embeddable components for the Ovation Guitars website:
- **Mapbox widget** — Interactive dealer map using Mapbox GL JS
- **Dealers widget** — Dealer listings organized by state

Both widgets pull live data from a single Google Sheet (CSV/JSON formats) and are deployed as standalone HTML files embedded as iframes.

## Build Process

**No npm or package manager.** Build tooling is [CodeKit 3](https://codekitapp.com/) (Mac GUI app).

- Source files: [js/](js/) and [css/](css/)
- Minified output: `ovation/mapbox/v{version}/` and `ovation/dealers/v{version}/`
- After editing source files, use CodeKit to minify/compress, then run the version script if releasing

### Version Management

To release a new version:
1. Edit `old_version` and `new_version` in [change_ver.sh](change_ver.sh)
2. Run `./change_ver.sh` — renames versioned directories and updates HTML asset references
3. Also update the version environment variable in CodeKit (controls output filenames)

Current version: **v3.2.2**

## Architecture

### Entry Points
- [ovation/mapbox/gewa-mapbox-ovation.html](ovation/mapbox/gewa-mapbox-ovation.html) — Mapbox iframe entry point
- [ovation/dealers/gewa-dealers-ovation.html](ovation/dealers/gewa-dealers-ovation.html) — Dealers iframe entry point

Each HTML file loads versioned JS/CSS from its sibling `v{version}/` directory.

### Data Flow
Both widgets fetch from one Google Sheet at runtime (no build-time data):
- Mapbox widget: fetches CSV → converts to GeoJSON via csv2geojson → renders with Turf.js clustering
- Dealers widget: fetches JSON → parses columns dynamically → renders Bootstrap HTML

### Iframe Communication
Both widgets call `window.parent.postMessage()` to report their rendered height to the parent page (used by Ovation's site to size the iframe).

### Frontend Dependencies (CDN only, no local install)
- jQuery 3.5.0
- Mapbox GL JS v2.0.1
- Bootstrap 5.3.3
- csv2geojson, Turf.js

### Mapbox Token
The Mapbox token is intentionally embedded in the source — it is domain-restricted.

## Key Files

| File | Purpose |
|------|---------|
| [js/gewa-mapbox.js](js/gewa-mapbox.js) | Mapbox widget source |
| [js/gewa-dealers.js](js/gewa-dealers.js) | Dealers widget source |
| [css/gewa-mapbox.css](css/gewa-mapbox.css) | Mapbox styles source |
| [css/gewa-dealers.css](css/gewa-dealers.css) | Dealers styles source |
| [change_ver.sh](change_ver.sh) | Version bump script |
