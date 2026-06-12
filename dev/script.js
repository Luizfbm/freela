const commands = document.querySelectorAll(".command");
const sections = [...document.querySelectorAll("main section[id]")];
const backToTop = document.querySelector(".back-to-top");
const promptLine = document.querySelector(".hero .prompt");
const codeViewers = document.querySelectorAll("[data-code-viewer]");
const githubStats = document.querySelectorAll("[data-github-stat]");

const commandByTarget = new Map(
  [...commands].map((button) => [button.dataset.target, button])
);

function setActiveCommand(id) {
  commands.forEach((button) => {
    button.classList.toggle("active", button.dataset.target === id);
  });
}

commands.forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.getElementById(button.dataset.target);
    if (!target) return;

    setActiveCommand(button.dataset.target);
    history.pushState(null, "", `#${button.dataset.target}`);
    requestAnimationFrame(() => {
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });
    });
  });
});

const observer = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

    if (visible && commandByTarget.has(visible.target.id)) {
      setActiveCommand(visible.target.id);
    }
  },
  {
    rootMargin: "-30% 0px -55% 0px",
    threshold: [0.1, 0.3, 0.6]
  }
);

sections.forEach((section) => observer.observe(section));

window.addEventListener("scroll", () => {
  backToTop.classList.toggle("visible", window.scrollY > 520);
});

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function typePrompt(element, text) {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  element.textContent = "$ ";
  let index = 0;
  const timer = window.setInterval(() => {
    element.textContent = `$ ${text.slice(0, index)}`;
    index += 1;

    if (index > text.length) {
      window.clearInterval(timer);
    }
  }, 42);
}

const isHomePage = location.pathname.endsWith("/") || location.pathname.endsWith("/index.html");
if (isHomePage) {
  typePrompt(promptLine, "./about-luiz.sh");
}

function makeAsciiBar(value, max) {
  const total = 12;
  const filled = Math.max(1, Math.min(total, Math.round((value / max) * total)));
  return `${"█".repeat(filled)}${"░".repeat(total - filled)}`;
}

async function hydrateGithubStats() {
  if (!githubStats.length) return;

  const [profileResponse, reposResponse] = await Promise.all([
    fetch("https://api.github.com/users/Luizfbm"),
    fetch("https://api.github.com/users/Luizfbm/repos?per_page=100&sort=updated")
  ]);

  if (!profileResponse.ok || !reposResponse.ok) {
    throw new Error("GitHub API unavailable");
  }

  const profile = await profileResponse.json();
  const repos = await reposResponse.json();
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const updatedRecently = repos.filter((repo) => new Date(repo.updated_at).getTime() >= ninetyDaysAgo).length;
  const repoLanguages = new Set(repos.map((repo) => repo.language).filter(Boolean));
  const stackPriority = ["TypeScript", "JavaScript", "Python", "PHP", "Java", "C#"];
  const featuredStack = stackPriority.find((language) => repoLanguages.has(language)) || "TypeScript";

  document.querySelector('[data-github-stat="repos"]').textContent = profile.public_repos;
  document.querySelector('[data-github-stat="updated"]').textContent = updatedRecently;
  document.querySelector('[data-github-stat="language"]').textContent = featuredStack;
  document.querySelector('[data-github-bar="repos"]').textContent = makeAsciiBar(profile.public_repos, 30);
  document.querySelector('[data-github-bar="updated"]').textContent = makeAsciiBar(updatedRecently, 15);
}

hydrateGithubStats().catch(() => {
  document.querySelector('[data-github-stat="repos"]').textContent = "GitHub";
  document.querySelector('[data-github-stat="updated"]').textContent = "auto";
  document.querySelector('[data-github-stat="language"]').textContent = "TypeScript";
  document.querySelector('[data-github-bar="repos"]').textContent = "████████░░░░";
  document.querySelector('[data-github-bar="updated"]').textContent = "██████░░░░░░";
});

codeViewers.forEach((viewer) => {
  const tabs = viewer.querySelectorAll("[data-code-tab]");
  const panes = viewer.querySelectorAll("[data-code-pane]");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.codeTab;

      tabs.forEach((item) => {
        item.classList.toggle("active", item === tab);
      });

      panes.forEach((pane) => {
        pane.classList.toggle("active", pane.dataset.codePane === target);
      });
    });
  });
});
