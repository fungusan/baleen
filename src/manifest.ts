import { defineManifest } from '@crxjs/vite-plugin';

// She runs on every HTTP(S) page, so there is nothing to assign. `scripting` plus matching host
// access lets the popup remount her in tabs that a reloaded extension orphaned.
export default defineManifest({
  manifest_version: 3,
  name: 'Baleen',
  version: '2.0.0',
  description:
    'A whale companion who chats about what you highlight and summarizes pages with your own DeepSeek, Kimi, Qwen, GLM, or MiniMax key.',
  // 123 is the first Chrome with `light-dark()`; the UI tokens depend on it.
  minimum_chrome_version: '123',
  permissions: ['storage', 'scripting', 'webRequest'],
  host_permissions: [
    'http://*/*',
    'https://*/*',
    'https://api.deepseek.com/*',
    'https://api.moonshot.ai/*',
    'https://dashscope-intl.aliyuncs.com/*',
    'https://api.z.ai/*',
    'https://api.minimax.io/*',
  ],
  icons: {
    16: 'icons/16.png',
    32: 'icons/32.png',
    48: 'icons/48.png',
    128: 'icons/128.png',
    256: 'icons/256.png',
  },
  action: { default_popup: 'popup.html', default_title: 'Baleen' },
  background: { service_worker: 'src/background.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['src/content/main.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    { resources: ['characters/*'], matches: ['https://*/*', 'http://*/*'] },
  ],
  commands: {
    'toggle-companion': {
      suggested_key: { default: 'Alt+Shift+G' },
      description: 'Show or hide the companion',
    },
  },
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; connect-src 'self' https://api.deepseek.com https://api.moonshot.ai https://dashscope-intl.aliyuncs.com https://api.z.ai https://api.minimax.io http://*:* https://*:*",
  },
});
