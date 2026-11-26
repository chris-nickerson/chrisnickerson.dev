import { captureDir, channel, devURL } from "./browser-check.mjs";
import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { isConfigured, profile } from "../src/profile.ts";
const displayName = isConfigured(profile.fullName) ? profile.fullName : "Chris";
const b = await chromium.launch({ headless: true, channel }),
  report = [];
try {
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
    [320, 568],
    [844, 390],
  ]) {
    const c = await b.newContext({
        viewport: { width, height },
        hasTouch: width < 600,
        isMobile: width < 600,
        reducedMotion: width === 320 ? "reduce" : "no-preference",
      }),
      p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await p.goto(devURL);
    await p.waitForFunction(() => window.__AFTER_RAIN__?.stats().ready);
    await p.waitForTimeout(1000);
    await expect(p.locator("#title")).toHaveText(`${displayName}.`);
    await expect(p).toHaveTitle("Chris Nickerson");
    expect(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    ).toBe(false);
    await p.screenshot({ path: `${captureDir}/personal-home-${width}.png` });
    const introduction = p.getByRole("button", {
      name: "Get to know me",
      exact: true,
    });
    await introduction.focus();
    await p.keyboard.press("Enter");
    await expect(p.locator("#places")).toBeVisible();
    for (const stop of await p.locator("#places article").all()) {
      await expect(stop.getByRole("button")).toHaveText(["Fly in", "Read now"]);
    }
    await p.screenshot({ path: `${captureDir}/personal-stops-${width}.png` });
    for (const [id, heading] of [
      ["memory", "A little about me."],
      ["workshop", "Things I’ve built."],
      ["dock", "Away from the keyboard."],
    ]) {
      if (id !== "memory")
        await p
          .getByRole("button", { name: "Meet Chris", exact: true })
          .click();
      await p.locator(`[data-story="${id}"]`).first().click();
      await expect(p.locator("#story-heading")).toHaveText(heading);
      await expect(p.locator("#story")).toHaveJSProperty("scrollTop", 0);
      if (id === "memory") {
        const bio = isConfigured(profile.oneLineBio)
          ? profile.oneLineBio
          : "I’m Chris, a staff software engineer at WRITER.";
        await expect(p.locator("#story-body .bio")).toHaveText(bio);
      }
      if (id === "workshop") {
        await expect(
          p.getByRole("heading", { name: "GhostHost", exact: true }),
        ).toBeVisible();
        await expect(p.locator("#story-body img")).toHaveJSProperty(
          "naturalWidth",
          1300,
        );
      }
      if (id === "dock") {
        if (isConfigured(profile.personalNotes)) {
          await expect(p.locator("#story-body > p")).toHaveText(
            profile.personalNotes.split(/\n\s*\n/),
          );
        }
        const hrefs = (links) => links.map((link) => link.getAttribute("href"));
        const contact = await p.locator("#contact-links a").evaluateAll(hrefs);
        expect(await p.locator("#story-body a").evaluateAll(hrefs)).toEqual(
          contact,
        );
        if (!contact.length) {
          await expect(p.locator("#story-body")).toContainText(
            "No public links yet.",
          );
        }
      }
      await p.screenshot({ path: `${captureDir}/personal-${id}-${width}.png` });
      await p.locator("#story").evaluate((sheet) => {
        sheet.scrollTop = sheet.scrollHeight;
      });
      await expect(p.locator("#story .close")).toBeInViewport({ ratio: 1 });
      await expect(p.locator("#pause")).toHaveAttribute("aria-pressed", "true");
      await p.keyboard.press("Escape");
      if (id === "memory") await expect(introduction).toBeFocused();
      await expect(p.locator("#pause")).toHaveAttribute(
        "aria-pressed",
        String(width === 320),
      );
    }
    await p.getByRole("button", { name: "My links", exact: true }).click();
    await expect(p.locator("#contact-heading")).toHaveText("My links");
    await p.keyboard.press("Escape");
    await p
      .getByRole("button", { name: "How this world works", exact: true })
      .click();
    await p.getByRole("button", { name: /Try a rain run/ }).click();
    await expect(p.locator("#rain-brief")).toBeVisible();
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Go flying", exact: true }).click();
    expect(await p.evaluate(() => window.__AFTER_RAIN__.stats().assisted)).toBe(
      false,
    );
    expect(errors).toEqual([]);
    report.push({
      width,
      height,
      errors,
      personalNavigation: true,
      flight: true,
      rainBrief: true,
    });
    console.log("PASS personal navigation", width, height);
    await c.close();
  }
  const c = await b.newContext(),
    p = await c.newPage();
  const fixture = {
    fullName: "Test Pilot",
    oneLineBio: "Biography fixture.",
    aboutMe: "First paragraph.\n\nSecond paragraph.",
    personalNotes:
      "Personal note fixture.\n\n<script>window.__UNSAFE__=true</script>",
    selectedProjects: "",
    github: "https://example.invalid/code",
    linkedin: "{{LINKEDIN_URL}}",
    email: "test@example.invalid",
    resume: "http://example.invalid/insecure",
    links: [{ label: "Writing", url: "https://example.invalid/notes" }],
  };
  await p.route(/\/src\/profile\.ts(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body:
        (await response.text()) +
        `\nObject.assign(profile, ${JSON.stringify(fixture)});`,
    });
  });
  await p.goto(devURL);
  await expect(p.locator("#title")).toHaveText("Test Pilot.");
  await p.getByRole("button", { name: "Get to know me", exact: true }).click();
  await p.locator('[data-story="memory"]').first().click();
  await expect(p.locator("#story-body .personal-copy p")).toHaveText([
    "First paragraph.",
    "Second paragraph.",
  ]);
  await expect(p.locator("#story-body")).toContainText("Biography fixture.");
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "Meet Chris", exact: true }).click();
  await p.locator('[data-story="dock"]').first().click();
  await expect(p.locator("#story-body")).toContainText(
    "<script>window.__UNSAFE__=true</script>",
  );
  expect(await p.evaluate(() => window.__UNSAFE__)).toBeUndefined();
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "My links", exact: true }).click();
  await expect(p.locator("#contact-links a")).toHaveCount(3);
  await expect(p.getByRole("link", { name: "GitHub Open" })).toHaveAttribute(
    "href",
    "https://example.invalid/code",
  );
  await expect(p.getByRole("link", { name: "Writing Open" })).toHaveAttribute(
    "href",
    "https://example.invalid/notes",
  );
  await expect(
    p.getByRole("link", { name: "Email test@example.invalid" }),
  ).toHaveAttribute("href", "mailto:test@example.invalid");
  report.push({
    editableProfile: true,
    paragraphs: true,
    customLinks: true,
    plainText: true,
  });
  console.log("PASS editable profile");
  await c.close();
} finally {
  await fs.writeFile(
    `${captureDir}/personal-verification.json`,
    JSON.stringify(report, null, 2),
  );
  await b.close();
}
