export const profile = {
  fullName: "Chris",
  oneLineBio:
    "I’m a staff software engineer at WRITER. I grew up in New Jersey and lived in Boston for a while. These days I live in California with my wife, Taylor.",
  // Separate paragraphs with a blank line. Plain text, never HTML.
  aboutMe: `I care about building software people can rely on. I think AI can make a real difference in people’s lives, and those of us building it have a responsibility to think carefully about how it’s used.

I went to Penn State to study aerospace engineering. I graduated in 2019, and my first job was writing software for a radar system. I’m still a pretty big airplane nerd, which might explain the floatplane on the way in.

I got into language models through a side project called GhostHost. I built a chatbot that small businesses could add to their websites. At a restaurant, a guest could use it to ask about the menu or book a table. That project led me to WRITER, where I started as a prompt engineer working directly with customers.

These days my main focus is the core harness behind WRITER Agent. I led its rewrite and also work on agent memory. I built the agent’s presentation feature and many of the tools it uses to browse the web and work with files.

On my own time, I’ve built a couple of iOS apps, Alibi Shift and Anchors. I also like hiking here in California and traveling with Taylor. Our last two big trips were to Japan and Tanzania.`,
  personalNotes: `I’ve loved airplanes since before I studied aerospace. For this site I picked a floatplane, which gave me an excuse to work out how a pair of floats should meet the water. If you watch one of the landings, you can see the nose come up just before they touch.

Taylor and I like to get outside here in California, and we travel together whenever we can. We went to Japan and, more recently, Tanzania. I’m picking out some photos from those trips and from Alaska to put here.`,
  selectedProjects: "",
  github: "https://github.com/chris-nickerson",
  linkedin: "https://www.linkedin.com/in/christopherjnickerson",
  email: "",
  resume: "",
  links: [] as Array<{ label: string; url: string }>,
};
export const isConfigured = (value: string) =>
  !!value.trim() && !value.includes("{{");
