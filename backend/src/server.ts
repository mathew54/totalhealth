import { createApp } from './app.js';
import { env } from './config/env.js';
import { iniciarSincronizacionTasas } from './jobs/syncTasas.js';

const app = createApp();

app.listen(env.port, () => {
  console.log(`[totalhealth] API escuchando en http://localhost:${env.port} (${env.nodeEnv})`);
  iniciarSincronizacionTasas();
});