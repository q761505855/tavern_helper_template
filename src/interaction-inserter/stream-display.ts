import { ref } from 'vue';

export type StreamDisplayMessage = {
  id: string;
  content: string;
};

export function createStreamDisplayState() {
  const generationId = ref<string | null>(null);
  const messageId = ref<string | null>(null);
  const content = ref('');

  function start(nextGenerationId: string, nextMessageId: string) {
    generationId.value = nextGenerationId;
    messageId.value = nextMessageId;
    content.value = '';
  }

  function update(ownerGenerationId: string, nextContent: string) {
    if (generationId.value !== ownerGenerationId) return;
    content.value = nextContent;
  }

  function clear(ownerGenerationId: string) {
    if (generationId.value !== ownerGenerationId) return;
    generationId.value = null;
    messageId.value = null;
    content.value = '';
  }

  function contentFor(message: StreamDisplayMessage): string {
    return message.id === messageId.value ? content.value : message.content;
  }

  return {
    start,
    update,
    clear,
    contentFor,
  };
}
