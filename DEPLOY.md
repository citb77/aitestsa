# Deploy to GitHub Pages

This project uses **Vite** and deploys via **GitHub Actions** to **GitHub Pages**.

## One-time setup (GitHub)

1. Create a new GitHub repo (example: `staratlas-sidescroller`).
2. Push this folder to the repo’s **`main`** branch.
3. In the GitHub repo:
   - Go to **Settings → Pages**
   - Under **Build and deployment**, set **Source** to **GitHub Actions**

After that, every push to `main` will build and deploy automatically.

## Local build

```bash
npm ci
npm run build
npm run preview
```

## Notes about base paths

GitHub Pages serves project sites from a sub-path:

- `https://<user>.github.io/<repo>/`

The workflow sets `BASE_PATH=/<repo>/` for you.

If you ever need a manual build with a specific base path:

```bash
BASE_PATH=/staratlas-sidescroller/ npm run build
```
