import { ref } from 'vue';

function extractThinking(input: string): string {
  const match = String(input ?? '').match(
    /<(think[A-Za-z0-9_.:~-]*)(?=[\s>])[^>]*>([\s\S]*?)(?:<\/\1\s*>|$)/i,
  );
  return match?.[2]?.trim() ?? '';
}

export type StreamDisplayMessage = {
  id: string;
  content: string;
  rawContent?: string;
};

export function createStreamDisplayState() {
  const generationId = ref<string | null>(null);
  const messageId = ref<string | null>(null);
  const rawContent = ref('');
  const content = ref('');

  function start(nextGenerationId: string, nextMessageId: string) {
    generationId.value = nextGenerationId;
    messageId.value = nextMessageId;
    rawContent.value = '';
    content.value = '';
  }

  function update(ownerGenerationId: string, nextContent: string, nextRawContent = nextContent) {
    if (generationId.value !== ownerGenerationId) return;
    rawContent.value = nextRawContent;
    content.value = nextContent;
  }

  function clear(ownerGenerationId: string) {
    if (generationId.value !== ownerGenerationId) return;
    generationId.value = null;
    messageId.value = null;
    rawContent.value = '';
    content.value = '';
  }

  function contentFor(message: StreamDisplayMessage): string {
    return message.id === messageId.value ? content.value : message.content;
  }

  function rawContentFor(message: StreamDisplayMessage): string {
    return message.id === messageId.value ? rawContent.value : (message.rawContent ?? message.content);
  }

  function thinkingFor(message: StreamDisplayMessage): string {
    return extractThinking(rawContentFor(message));
  }

  return {
    start,
    update,
    clear,
    contentFor,
    rawContentFor,
    thinkingFor,
  };
}
