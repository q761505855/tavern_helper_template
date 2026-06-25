import { createScriptIdDiv, teleportStyle } from '@util/script';
import App from './App.vue';
import { ensureInteractionRecordsDisplayRegex, removeInteractionRecordsDisplayRegex } from './regex';
import './style.scss';

const BUTTON_NAME = '打开互动工作台';
const MENU_ITEM_CONTAINER_ID = 'interaction-inserter-extensions-menu-container';
const MENU_ITEM_ID = 'interaction-inserter-menu-item';
const MENU_EVENT_NAMESPACE = '.interactionInserter';

function openWorkbench() {
  eventEmit('interaction-inserter:open');
}

function closeExtensionsMenuIfOpen($extensionsMenu: JQuery<HTMLElement>) {
  const $extensionsMenuButton = $('#extensionsMenuButton');
  if ($extensionsMenuButton.length > 0 && $extensionsMenu.is(':visible')) {
    $extensionsMenuButton.trigger('click');
  }
}

function bindExtensionsMenuItem($extensionsMenu: JQuery<HTMLElement>) {
  const $menuItem = $(`#${MENU_ITEM_ID}`, $extensionsMenu);
  $menuItem.off(`click${MENU_EVENT_NAMESPACE}`).on(`click${MENU_EVENT_NAMESPACE}`, event => {
    event.stopPropagation();
    closeExtensionsMenuIfOpen($extensionsMenu);
    openWorkbench();
  });
}

function appendExtensionsMenuItem(): number | undefined {
  const $extensionsMenu = $('#extensionsMenu');
  if ($extensionsMenu.length === 0) {
    return window.setTimeout(appendExtensionsMenuItem, 2000);
  }

  let $menuItemContainer = $(`#${MENU_ITEM_CONTAINER_ID}`, $extensionsMenu);
  if ($menuItemContainer.length === 0) {
    $menuItemContainer = $(`
      <div class="extension_container interactable" id="${MENU_ITEM_CONTAINER_ID}" tabindex="0">
        <div class="list-group-item flex-container flexGap5 interactable" id="${MENU_ITEM_ID}" title="${BUTTON_NAME}" tabindex="0" role="listitem">
          <div class="fa-fw fa-solid fa-comments extensionsMenuExtensionButton"></div>
          <span>互动工作台</span>
        </div>
      </div>
    `);
    $extensionsMenu.append($menuItemContainer);
  }

  bindExtensionsMenuItem($extensionsMenu);
  return undefined;
}

function init() {
  appendInexistentScriptButtons([{ name: BUTTON_NAME, visible: true }]);
  void ensureInteractionRecordsDisplayRegex();
  const menuRetryTimeout = appendExtensionsMenuItem();

  const $host = createScriptIdDiv().appendTo('body');
  const app = createApp(App).use(createPinia());
  app.mount($host[0]);

  const { destroy } = teleportStyle();

  eventOn(getButtonEvent(BUTTON_NAME), () => {
    openWorkbench();
  });

  $(window).on('pagehide', () => {
    if (menuRetryTimeout !== undefined) {
      window.clearTimeout(menuRetryTimeout);
    }
    void removeInteractionRecordsDisplayRegex();
    $(`#${MENU_ITEM_ID}`).off(MENU_EVENT_NAMESPACE);
    $(`#${MENU_ITEM_CONTAINER_ID}`).remove();
    app.unmount();
    $host.remove();
    destroy();
  });
}

$(() => {
  errorCatched(init)();
});
