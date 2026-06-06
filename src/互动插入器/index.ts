import { createScriptIdDiv, teleportStyle } from '@util/script';
import App from './App.vue';
import './style.scss';

const BUTTON_NAME = '打开互动工作台';

function init() {
  appendInexistentScriptButtons([{ name: BUTTON_NAME, visible: true }]);

  const $host = createScriptIdDiv().appendTo('body');
  const app = createApp(App).use(createPinia());
  app.mount($host[0]);

  const { destroy } = teleportStyle();

  eventOn(getButtonEvent(BUTTON_NAME), () => {
    eventEmit('interaction-inserter:open');
  });

  $(window).on('pagehide', () => {
    app.unmount();
    $host.remove();
    destroy();
  });
}

$(() => {
  errorCatched(init)();
});
