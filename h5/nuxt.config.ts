// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  // Dev server port — override the default 3000 to avoid local port clashes.
  devServer: { port: 3111 },

  // Disable the optional app manifest. Its virtual module (`#app-manifest`) is
  // generated lazily and throws a noisy pre-transform error in dev; this app
  // doesn't rely on route rules / payload introspection, so it's safe to drop.
  experimental: { appManifest: false },

  // Global Liquid Glass design system styles
  css: [
    '~/assets/css/tokens.css',
    '~/assets/css/base.css',
    '~/assets/css/glass.css',
    '~/assets/css/animations.css'
  ],

  app: {
    head: {
      title: 'Hermes · Liquid Glass',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1' },
        { name: 'theme-color', content: '#0a0a0f' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'description', content: 'Hermes Agent 会话客户端 · iOS 26 Liquid Glass 风格' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ]
    },
    pageTransition: { name: 'page', mode: 'out-in' },
    layoutTransition: { name: 'page', mode: 'out-in' }
  },

  runtimeConfig: {
    // Server-only secrets (never exposed to the client)
    hermesBaseUrl: process.env.HERMES_BASE_URL || 'http://127.0.0.1:8642',
    hermesApiKey: process.env.HERMES_API_KEY || 'change-me-local-dev',
    // Public runtime config — safe to expose to the browser
    public: {
      appName: 'Hermes',
      defaultModel: 'hermes-agent'
    }
  }
})
