const phoneNumber = "5527993112102";
const defaultMessage = "Oi, Luiz. Vi seu portfólio e quero conversar sobre um site para meu negócio.";

const header = document.querySelector("[data-header]");
const menu = document.querySelector("[data-menu]");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = [...document.querySelectorAll(".nav-links a")];
const revealItems = [...document.querySelectorAll(".reveal")];
const contactForm = document.querySelector("[data-contact-form]");
const packageButtons = [...document.querySelectorAll(".package-action")];

function updateHeader() {
  header?.classList.toggle("is-scrolled", window.scrollY > 12);
}

function closeMenu() {
  document.body.classList.remove("menu-open");
  menu?.classList.remove("is-open");
  menuToggle?.setAttribute("aria-expanded", "false");
}

menuToggle?.addEventListener("click", () => {
  const isOpen = menu?.classList.toggle("is-open");
  document.body.classList.toggle("menu-open", Boolean(isOpen));
  menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
});

navLinks.forEach((link) => {
  link.addEventListener("click", closeMenu);
});

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.getAttribute("id");
        navLinks.forEach((link) => {
          link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
        });
      });
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
  );

  document.querySelectorAll("section[id]").forEach((section) => {
    sectionObserver.observe(section);
  });

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.1 }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

function openWhatsApp(message) {
  const encoded = encodeURIComponent(message || defaultMessage);
  window.open(`https://wa.me/${phoneNumber}?text=${encoded}`, "_blank", "noopener,noreferrer");
}

packageButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const packageName = button.dataset.package || "site para pequeno negócio";
    openWhatsApp(`Oi, Luiz. Vi seu portfólio e quero conversar sobre: ${packageName}.`);
  });
});

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(contactForm);
  const name = String(formData.get("nome") || "").trim();
  const business = String(formData.get("negocio") || "").trim();
  const message = String(formData.get("mensagem") || "").trim();

  const composedMessage = [
    `Oi, Luiz. Meu nome é ${name}.`,
    `Meu negócio: ${business}.`,
    `Quero melhorar: ${message}`,
  ].join("\n");

  openWhatsApp(composedMessage);
  contactForm.reset();
});

window.addEventListener("scroll", updateHeader, { passive: true });
window.addEventListener("resize", () => {
  if (window.innerWidth > 980) closeMenu();
});

updateHeader();
