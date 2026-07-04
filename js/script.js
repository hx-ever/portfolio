// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Highlight the active "via" on the trace nav as sections scroll into view
const sections = document.querySelectorAll('main section[id]');
const links = document.querySelectorAll('.trace-vias a');

const setActive = (id) => {
  links.forEach(link => {
    link.classList.toggle('active', link.dataset.target === id);
  });
};

if ('IntersectionObserver' in window && sections.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setActive(entry.target.id);
      }
    });
  }, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });

  sections.forEach(section => observer.observe(section));
} else if (links.length) {
  // Fallback: just mark the first link active
  links[0].classList.add('active');
}
