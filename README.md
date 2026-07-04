# Hank Hsu — Portfolio

Static site. No build step, no framework — plain HTML/CSS/JS, so it deploys instantly and loads fast.

## Before you deploy — fill these in

1. **`index.html`**
   - `href="mailto:your.email@example.com"` → your real email
   - `href="https://linkedin.com/in/yourprofile"` → your LinkedIn
   - `href="https://github.com/yourusername"` → your GitHub
   - `href="/resume.pdf"` → add a `resume.pdf` file in the project root, or remove the button
2. **`images/`** — swap the dashed placeholder boxes for real photos:
   - Each `.project-media` div currently shows a placeholder grid with a label. Replace with:
     `<img src="images/your-photo.jpg" alt="...">` inside the div, and remove the `data-placeholder` attribute.
   - Good shots: the physical PCB, the drone mid-build, the buggy on track, the display + encoders. Real hardware photos outperform renders here.
3. **Project copy** — the four project blocks (ESP32 mesh, FPV stack, buggy, encoder UI) are drafted from what I know of your work. Check every technical detail before this goes live — I may have details slightly off, and you'll want to add your own specifics (sensor types, board revision, what broke and how you fixed it).

## Deploy to Vercel (free)

1. Push this folder to a new GitHub repo.
2. Go to vercel.com → sign in with GitHub → "Add New Project" → select the repo.
3. Framework preset: **Other** (it's static, no build command needed).
4. Click Deploy. You'll get a live URL like `hank-portfolio.vercel.app` in under a minute.
5. Every future `git push` auto-redeploys.

Optional later: buy a domain (~$10–15/yr) and add it under Project → Settings → Domains in Vercel. Not required — the free subdomain is fully fine to put on a resume.

## Local preview

Just open `index.html` in a browser — no server needed since there's no build step.
