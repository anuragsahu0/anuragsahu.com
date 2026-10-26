# Portfolio — Enterprise Foundation

[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.1.6-purple.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.1-cyan.svg)](https://tailwindcss.com/)
[![ESLint](https://img.shields.io/badge/ESLint-8.57.0-4b32c3.svg)](https://eslint.org/)
[![Prettier](https://img.shields.io/badge/Prettier-3.2.5-pink.svg)](https://prettier.io/)

A world-class, production-ready frontend architecture built for the web application. Designed from first principles to showcase high-performance systems engineering, computer vision & machine learning projects, and weightless visual aesthetic.

---

## 🚀 Key Architectural Features

- **⚡ Fast Build System:** Powered by Vite 5 with Hot Module Replacement (HMR) and optimized rollup production bundling.
- **🎨 Custom Design System:** Built with Tailwind CSS, custom space obsidian palettes, glassmorphism tokens, and geometric fonts (`Space Grotesk`, `Outfit`, `Inter`, `JetBrains Mono`).
- **🧩 Enterprise Modular Structure:** Strict separation of concerns across 3D canvas modules (`src/3d/`), animations (`src/animations/`), services (`src/services/`), data schemas (`src/data/`), and custom hooks (`src/hooks/`).
- **🛣️ Client-Side Routing:** Declarative nested routing using React Router v6 with `RootLayout`, `MainLayout`, and custom 404 `NotFoundPage`.
- **🛡️ Error Resilience:** Global React `ErrorBoundary` wrapper capturing runtime errors with a fallback recovery UI.
- **🌓 Theme Architecture:** Context-driven `ThemeProvider` supporting persistent dark/light mode toggles.
- **⚓ Pre-commit Quality Pipeline:** Configured with `Husky` and `lint-staged` ensuring strict ESLint compliance and Prettier code formatting prior to commits.
- **📍 Path Aliasing (`@/*`):** Clean import paths mapped to `./src/*` across Vite, ESLint, and IDE `jsconfig.json`.

---

## 📁 Directory Structure

```text
Portfolio/
├── .eslintrc.cjs                 # ESLint rules & React hooks validation
├── .gitignore                    # Git tracking ignore patterns
├── .prettierrc                   # Prettier code formatting rules
├── .env.example                  # Template environment variables
├── index.html                    # Root HTML5 document & Google Fonts imports
├── jsconfig.json                 # Path alias mapping for VS Code / Cursor
├── package.json                  # Dependencies & npm build scripts
├── postcss.config.js             # PostCSS processing configuration
├── tailwind.config.js            # Tailwind theme tokens & glassmorphism utilities
├── vite.config.js                # Vite build engine & alias resolution
└── src/
    ├── 3d/                       # Three.js / R3F WebGL canvas scenes & shaders
    ├── animations/               # Reusable Framer Motion physics variants
    ├── assets/                   # Static media, icons, and 3D models
    ├── components/               # UI components (common, ui, 3d)
    │   └── common/
    │       └── ErrorBoundary.jsx # Global error handling fallback component
    ├── constants/                # App config, routes, and theme constants
    ├── context/                  # React State Contexts (ThemeContext.jsx)
    ├── data/                     # Centralized JS data schemas (projectsData, skillsData)
    ├── hooks/                    # Reusable custom hooks (useTheme, useMousePosition)
    ├── layouts/                  # RootLayout shell & MainLayout container
    ├── pages/                    # Route pages (HomePage, NotFoundPage)
    ├── routes/                   # AppRoutes v6 routing definitions
    ├── services/                 # External API client adapters
    ├── styles/                   # Global CSS & Tailwind directives
    ├── utils/                    # Utility helpers (cn.js Tailwind class merger)
    ├── App.jsx                   # Application shell component
    └── main.jsx                  # React DOM entrypoint
```

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation

```bash
# 1. Clone repository
git clone https://github.com/anuragsahu0/anuragsahu.com.git
cd anuragsahu.com

# 2. Install dependencies
npm install

# 3. Environment setup
cp .env.example .env.local

# 4. Start local development server
npm run dev
```

The application will be served at `http://localhost:3000`.

---

## 📜 NPM Available Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Launches local Vite development server on port 3000 |
| `npm run build` | Bundles production build into `/dist` directory |
| `npm run preview` | Previews production build locally |
| `npm run lint` | Runs ESLint check across JavaScript & JSX files |
| `npm run lint:fix` | Automatically fixes auto-fixable ESLint warnings |
| `npm run format` | Formats codebase using Prettier |
| `npm run format:check` | Verifies code formatting compliance |
| `npm run prepare` | Configures Husky git hooks |

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env.local` to define local environment configuration:

```env
VITE_APP_TITLE="Anurag Sahu Portfolio"
VITE_API_BASE_URL="https://api.domain.com"
VITE_ENABLE_ANALYTICS=false
```

---

## 📐 Coding Standards & Naming Conventions

- **React Components / Layouts / Pages:** `PascalCase.jsx` (e.g., `RootLayout.jsx`, `HomePage.jsx`)
- **Custom Hooks:** `camelCase.js` starting with `use` (e.g., `useTheme.js`, `useMousePosition.js`)
- **Utilities & Services:** `camelCase.js` (e.g., `cn.js`, `api.js`)
- **Constants & Enums:** `UPPER_SNAKE_CASE` or `camelCase.js` (e.g., `ROUTES`, `config.js`)
- **CSS Tokens & Classes:** `kebab-case` (e.g., `.glass-panel`, `.heading-gradient`)

---

## 📄 License
Designed & Developed under MIT License.
