import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const androidDev = mode === 'android-dev';
  const devEnv = androidDev ? loadEnv(mode, process.cwd(), 'VITE_') : {};
  if (mode === 'android') {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    let api;
    try {
      api = new URL(env.VITE_API_URL);
    } catch {
      throw new Error('Android requires VITE_API_URL in .env.android.local (a reachable HTTPS API).');
    }
    if (api.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(api.hostname)) {
      throw new Error('Android requires a reachable HTTPS VITE_API_URL; localhost points to the phone.');
    }
  }
  return {
  define: androidDev ? {
    'import.meta.env.VITE_API_URL': JSON.stringify(devEnv.VITE_ANDROID_API_URL || 'http://10.0.2.2:8000'),
  } : {},
  build: {
    rollupOptions: {
      input: {
        index: 'index.html', dashboard: 'dashboard.html',
        login: 'src/pages/login/login.html', recuperar: 'src/pages/login/recuperar.html',
        nuevaContrasena: 'src/pages/login/nueva-contrasena.html',
        gestion: 'src/pages/gestion/gestion.html',
        nuevo: 'src/pages/gestion/nuevo.html', reportes: 'src/pages/gestion/reportes.html',
        usuarios: 'src/pages/gestion/usuarios.html',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  };
});
