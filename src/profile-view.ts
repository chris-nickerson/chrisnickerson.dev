import { isConfigured, profile } from "./profile";
import type { PlaceId } from "./places";

export const placeContent: Record<
  PlaceId,
  {
    title: string;
    subtitle: string;
    copy: string;
    action: string;
  }
> = {
  memory: {
    title: "The field station",
    subtitle: "A little about me",
    copy: "Growing up in New Jersey, studying aerospace, and how I found my way to WRITER.",
    action: "Read about me",
  },
  workshop: {
    title: "The workshop",
    subtitle: "Things I’ve built",
    copy: "The harness behind WRITER Agent, two iOS apps, and the tools I build for my own work.",
    action: "Explore my work",
  },
  dock: {
    title: "The quiet dock",
    subtitle: "Away from the keyboard",
    copy: "A bit about airplanes and where Taylor and I have been lately.",
    action: "Read more",
  },
};

const aboutMe = isConfigured(profile.aboutMe)
  ? profile.aboutMe
  : "I work across most of the stack.";

function renderParagraphs(host: HTMLElement, value: string) {
  host.replaceChildren();
  for (const text of value.split(/\n\s*\n/).filter((p) => p.trim())) {
    const p = document.createElement("p");
    p.textContent = text.trim();
    host.append(p);
  }
}
function renderLinks(host: HTMLElement) {
  host.replaceChildren();
  const links = [
    ["Email", profile.email],
    ["GitHub", profile.github],
    ["LinkedIn", profile.linkedin],
    ["Résumé", profile.resume],
    ...profile.links.map(({ label, url }) => [label, url]),
  ];
  let available = 0;
  for (const [label, value] of links) {
    const valid =
      isConfigured(value) &&
      (label === "Email"
        ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        : /^https:\/\//.test(value));
    if (!valid) continue;
    const row = document.createElement("a");
    const title = document.createElement("span");
    title.textContent = label;
    const detail = document.createElement("small");
    detail.textContent = label === "Email" ? value : "Open";
    row.append(title, detail);
    row.href = label === "Email" ? `mailto:${value}` : value;
    if (label !== "Email") {
      row.target = "_blank";
      row.rel = "noopener noreferrer";
    }
    available++;
    host.append(row);
  }
  return available;
}
export function populateProfile() {
  const name = isConfigured(profile.fullName) ? profile.fullName : "Chris";
  document.getElementById("header-name")!.textContent = name;
  document.getElementById("about-name")!.textContent = name;
  document.getElementById("hero-name")!.textContent = name;
  if (isConfigured(profile.oneLineBio))
    document.getElementById("bio")!.textContent = profile.oneLineBio;
  renderParagraphs(document.getElementById("about-personal")!, aboutMe);
  if (isConfigured(profile.selectedProjects)) {
    const selected = document.getElementById("selected-custom")!;
    selected.textContent = profile.selectedProjects;
    selected.hidden = false;
  }
  const available = renderLinks(document.getElementById("contact-links")!);
  document.getElementById("contact-note")!.hidden = available > 0;
}

export function renderStory(id: PlaceId) {
  const content = placeContent[id];
  document.getElementById("story-kicker")!.textContent = content.title;
  document.getElementById("story-heading")!.textContent =
    `${content.subtitle}.`;
  const body = document.getElementById("story-body")!;
  body.replaceChildren();
  if (id === "memory") {
    const bio = document.createElement("p");
    bio.className = "bio";
    bio.textContent = isConfigured(profile.oneLineBio)
      ? profile.oneLineBio
      : "I’m Chris, a staff software engineer at WRITER.";
    body.append(bio);
    const copy = document.createElement("div");
    copy.className = "personal-copy";
    renderParagraphs(copy, aboutMe);
    body.append(copy);
  } else if (id === "workshop") {
    const template =
      document.querySelector<HTMLTemplateElement>("#workshop-stories")!;
    body.append(template.content.cloneNode(true));
  } else {
    if (isConfigured(profile.personalNotes))
      renderParagraphs(body, profile.personalNotes);
    const photos = document.querySelector<HTMLTemplateElement>("#trip-photos")!;
    body.append(photos.content.cloneNode(true));
    const links = document.createElement("div");
    links.className = "contact-links";
    body.append(links);
    if (!renderLinks(links)) {
      const note = document.createElement("p");
      note.className = "contact-note";
      note.textContent = "No public links yet.";
      body.append(note);
    }
  }
  document.getElementById("story-visit")!.textContent =
    `Fly to ${content.title.toLowerCase()}`;
}
