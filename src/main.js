import './styles.css';
import { bindEditor } from './editor.js';
import { startRouter } from './router.js';
import { autoReconnect } from './disto/session.js';
import { initStore } from './store.js';
import { registerSW } from 'virtual:pwa-register';

const app = document.getElementById('app');
app.innerHTML = '<p class="boot">Opening Orb Survey…</p>';

try {
  await initStore();
  bindEditor();
  startRouter();
  autoReconnect();
  try {
    registerSW({ immediate: true });
  } catch (error) {
    console.error(error);
  }
} catch (error) {
  console.error(error);
  app.innerHTML = '<div class="screen"><div class="page-intro"><h1>Orb Survey could not start</h1><p>This phone may be blocking saved data. Try Chrome, and don’t use a private tab.</p></div></div>';
}
