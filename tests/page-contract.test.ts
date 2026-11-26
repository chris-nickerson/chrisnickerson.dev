import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { places } from "../src/places";

// The page, the TypeScript, and the browser scripts refer to one another by
// string. These checks name the broken reference without launching a browser.
const read = (path: string) => readFileSync(path, "utf8");
const sources = (dir: string, extension: RegExp) =>
  readdirSync(dir)
    .filter((name) => extension.test(name))
    .map((name) => ({ name: `${dir}/${name}`, text: read(`${dir}/${name}`) }));
const all = (text: string, pattern: RegExp) =>
  [...text.matchAll(pattern)].map((match) => match[1]);

const page = read("index.html");
const ids = new Set(all(page, /\sid="([^"]+)"/g));
const dialogs = new Set(all(page, /<dialog\b[^>]*?\sid="([^"]+)"/g));
const scripts = sources("scripts", /\.(mjs|ts)$/);

test("every element the source looks up by a literal id is on the page", () => {
  assert.ok(ids.has("experience") && dialogs.has("places"));
  for (const { name, text } of sources("src", /\.ts$/))
    for (const id of all(
      text,
      /(?:\$(?:<\w+>)?|getElementById)\(\s*"([^"]+)"\s*\)/g,
    ))
      assert.ok(ids.has(id), `${name} looks up #${id}`);
  for (const id of all(read("src/main.ts"), /openDialog\("([^"]+)"\)/g))
    assert.ok(dialogs.has(id), `main.ts opens a missing dialog, ${id}`);
});

test("page buttons name a real dialog or place", () => {
  const opens = all(page, /data-open="([^"]+)"/g);
  assert.ok(opens.includes("places"));
  for (const id of opens)
    assert.ok(dialogs.has(id), `data-open="${id}" needs <dialog id="${id}">`);
  const routes = ["visit", "story"];
  const anyRoute = new RegExp(`data-(?:${routes.join("|")})="([^"]+)"`, "g");
  for (const id of all(page, anyRoute))
    assert.ok(id in places, `no place named ${id}`);
  for (const id of Object.keys(places))
    for (const route of routes)
      assert.ok(
        page.includes(`data-${route}="${id}"`),
        `${id} has no ${route} button`,
      );
});

test("browser scripts select elements and simulation members that exist", () => {
  const simulation = read("src/simulation.ts");
  let checked = 0;
  for (const { name, text } of scripts) {
    for (const id of all(text, /["'`\s,(]#([a-z][\w-]*)/g)) {
      if (/^[0-9a-f]{3,8}$/.test(id)) continue;
      assert.ok(ids.has(id), `${name} selects #${id}`);
      checked++;
    }
    for (const [, attribute, value] of text.matchAll(
      /\[data-(\w+)="([a-z-]+)"\]/g,
    ))
      assert.ok(
        page.includes(`data-${attribute}="${value}"`),
        `${name} selects [data-${attribute}="${value}"]`,
      );
    for (const member of all(text, /\bsim\.(\w+)/g)) {
      assert.match(
        simulation,
        new RegExp(`^  (?:private |readonly |get )*${member}\\b`, "m"),
        `${name} uses Simulation.${member}`,
      );
      checked++;
    }
  }
  assert.ok(checked > 50, `only ${checked} references were found`);
});

test("flight chart markers follow the inlet destinations at eight metres per pixel", () => {
  const markers = [
    ...page.matchAll(/data-chart-place="(\w+)"\s+cx="(\d+)"\s+cy="(\d+)"/g),
  ];
  assert.equal(markers.length, Object.keys(places).length);
  for (const [id, place] of Object.entries(places)) {
    const marker = markers.find(([, name]) => name === id);
    assert.ok(marker, id);
    assert.equal(Number(marker[2]), Math.round(place.x / 8 + 810));
    assert.equal(Number(marker[3]), Math.round(place.z / 8 + 400));
  }
});
