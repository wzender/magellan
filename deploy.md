# Air-Gapped Deployment Guide

## Setting up on an air-gapped machine

### On the internet-connected source machine first

**Step 1 — Install all dependencies and build the client:**
```bash
# From project root
npm install

cd client
npm install
npm run build   # produces client/build/ — the compiled static files
cd ..
```

**Step 2 — Archive the project, including node_modules and the build:**
```bash
tar -czf magellan.tar.gz \
  server/ \
  client/build/ \
  node_modules/ \
  data/ \
  package.json \
  package-lock.json \
  start.sh
```

> Include `client/node_modules/` only if you need to be able to rebuild on the target. For just running the app, `client/build/` is enough.

---

### On the air-gapped machine

**Step 3 — Verify Node.js is available:**
```bash
node --version   # needs to be 16+
npm --version
```

If Node isn't installed, copy a Node.js binary installer (`.tar.gz` from nodejs.org, or an OS package) from the source machine via USB/disk.

**Step 4 — Extract and run:**
```bash
tar -xzf magellan.tar.gz -C /your/target/dir
cd /your/target/dir

# Start the server (serves the pre-built client on port 5000)
node server/index.js
# or
npm start
```

Open `http://localhost:5000` in the browser.

---

### What you do NOT need to do on the air-gapped machine

| Task | Why |
|---|---|
| `npm install` | `node_modules/` was copied over |
| `npm run build` | `client/build/` was pre-built |
| Internet access | Everything is local |

---

### Checklist before copying

- [ ] `node_modules/` exists at project root
- [ ] `client/build/` exists and is non-empty
- [ ] `data/*.csv` files are included
- [ ] Node.js version on target matches source (run `node --version` on both)
