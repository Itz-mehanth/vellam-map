import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Link-preview tags (og:image, canonical) must be absolute URLs, so the page needs to know
 * where it is hosted. Set VITE_SITE_URL, or let Vercel's production domain fill it in.
 */
function siteUrl(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const url = (env.VITE_SITE_URL || (vercel ? `https://${vercel}` : '')).replace(/\/$/, '')
  return {
    name: 'site-url',
    // 'pre' so the placeholder is replaced before Vite resolves relative URLs against the request path
    // (otherwise /?tab=ask turns "__SITE_URL__/og.png" into "//og.png").
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => {
        // Without a known address there is nothing true to say in a canonical link, and an
        // href of "/" would make Vite try to bundle the site root, so drop it.
        const page = url ? html : html.replace(/\s*<link rel="canonical"[^>]*>/, '')
        return page.replaceAll('__SITE_URL__', url)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), siteUrl(mode)],
  server: {
    // Forward API calls to the FastAPI backend during development.
    proxy: { '/api': 'http://localhost:8000' },
  },
}))
