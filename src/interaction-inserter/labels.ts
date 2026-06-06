import type { InteractionMode } from './preset';

export type InteractionMessageRole = 'user' | 'assistant' | 'system';

export interface RoleDisplayNameInput {
  userName?: string | null;
  characterName?: string | null;
}

type TavernGlobal = typeof globalThis & {
  name1?: unknown;
  substituteParams?: unknown;
  substitudeMacros?: unknown;
  SillyTavern?: unknown;
};

function getSillyTavernContext(): Record<string, unknown> | null {
  const sillyTavern = (globalThis as TavernGlobal).SillyTavern;
  if (!sillyTavern || typeof sillyTavern !== 'object') {
    return null;
  }
  const getContext = (sillyTavern as { getContext?: unknown }).getContext;
  if (typeof getContext !== 'function') {
    return sillyTavern as Record<string, unknown>;
  }
  try {
    const context = getContext();
    return context && typeof context === 'object' ? (context as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function callStringReplacer(replacer: unknown, content: string): string | null {
  if (typeof replacer !== 'function') {
    return null;
  }
  try {
    const expanded = replacer(content);
    return typeof expanded === 'string' ? expanded.trim() : null;
  } catch {
    return null;
  }
}

function expandTavernNameMacro(content: string): string {
  const globals = globalThis as TavernGlobal;
  const context = getSillyTavernContext();
  const sillyTavern = globals.SillyTavern && typeof globals.SillyTavern === 'object' ? globals.SillyTavern : null;
  const replacers = [
    globals.substitudeMacros,
    context?.substituteParams,
    sillyTavern ? (sillyTavern as { substituteParams?: unknown }).substituteParams : null,
    globals.substituteParams,
  ];
  for (const replacer of replacers) {
    const expanded = callStringReplacer(replacer, content);
    if (expanded) {
      return expanded;
    }
  }
  return content;
}

function isUserMacro(value: string): boolean {
  return value === '<user>' || value === '{{user}}';
}

function resolveUserName(value?: string | null): string {
  const raw = value?.trim() ?? '';
  const expanded = raw ? expandTavernNameMacro(raw) : '';
  if (expanded && !isUserMacro(expanded)) {
    return expanded;
  }
  for (const macro of ['<user>', '{{user}}']) {
    const resolved = expandTavernNameMacro(macro);
    if (resolved && !isUserMacro(resolved)) {
      return resolved;
    }
  }
  return raw || '<user>';
}

export function readTavernUserName(): string {
  const globals = globalThis as TavernGlobal;
  const context = getSillyTavernContext();
  const sillyTavern = globals.SillyTavern && typeof globals.SillyTavern === 'object' ? globals.SillyTavern : null;
  const candidates = [
    context?.name1,
    sillyTavern ? (sillyTavern as { name1?: unknown }).name1 : null,
    globals.name1,
  ];
  const value = candidates.find(candidate => typeof candidate === 'string' && candidate.trim());
  return resolveUserName(typeof value === 'string' ? value : null);
}

export function roleDisplayName(role: InteractionMessageRole, input: RoleDisplayNameInput): string {
  if (role === 'user') {
    return resolveUserName(input.userName);
  }
  if (role === 'assistant') {
    return input.characterName?.trim() || 'AI';
  }
  return '系统';
}

export function makeInteractionSessionTitle(mode: InteractionMode, characterName?: string | null): string {
  if (mode === 'scene') return '当下场景';
  const modeLabel = mode === 'private' ? '一对一' : '远程通信';
  return `${modeLabel}：${characterName?.trim() || '未选择角色'}`;
}
