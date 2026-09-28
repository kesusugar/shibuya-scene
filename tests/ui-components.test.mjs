import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  // Do not invalidate a concurrently running scene preview's dependency cache.
  cacheDir: path.join(root, 'node_modules', '.vite-ui-tests'),
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the game's stylesheet with the animation layer and reduced-motion rules", async () => {
  const css = await readCssTree(path.join(root, "dist"));

  // The game's own overlay styles (app/globals.css).
  assert.match(css, /\.presentation/);
  assert.match(css, /\.play-hud|\.play-/);
  // tw-animate-css and the vendored shadcn layer, which app/globals.css still imports. The
  // scrolling and mask utilities the removed catalog components used are no longer emitted:
  // Tailwind only emits what the source uses (§9bg).
  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

// The starter's component catalog went in the starter clean-up (§9bg); the game's settings use one
// of its components, the switch, which stays.
test("renders the settings switch with its state and size", async () => {
  const { Switch } = await vite.ssrLoadModule("/components/ui/switch.tsx");
  const html = renderToStaticMarkup(React.createElement(Switch, { checked: true, size: "sm", "aria-label": "gyro" }));

  assert.match(html, /role="switch"/);
  assert.match(html, /aria-checked="true"/);
  assert.match(html, /data-size="sm"/);
});
