import { defineConfig } from 'vite';

export default defineConfig({
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
});
