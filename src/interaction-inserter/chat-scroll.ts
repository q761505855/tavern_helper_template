export const CHAT_BOTTOM_THRESHOLD_PX = 48;

export type ChatScrollMetrics = Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>;

export function isNearChatBottom(
  { scrollHeight, scrollTop, clientHeight }: ChatScrollMetrics,
  threshold = CHAT_BOTTOM_THRESHOLD_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}

export function scrollChatToBottom(element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop'>): void {
  element.scrollTop = element.scrollHeight;
}

export function shouldForceGenerationCompletionScroll(
  generationSessionId: string | null,
  activeSessionId: string | null,
): boolean {
  return generationSessionId !== null && generationSessionId === activeSessionId;
}

export function shouldForceWorkbenchScroll(isOpen: boolean, view: 'workbench' | 'settings'): boolean {
  return isOpen && view === 'workbench';
}
