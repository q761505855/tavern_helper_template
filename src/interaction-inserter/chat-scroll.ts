export function scrollChatToBottom(element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>): void {
  element.scrollTop = element.scrollHeight;
}

export function shouldForceWorkbenchScroll(isOpen: boolean, view: 'workbench' | 'settings'): boolean {
  return isOpen && view === 'workbench';
}
