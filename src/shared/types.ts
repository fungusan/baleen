// The shipped characters. IDs are the art keys; the selected model decides which one is drawn.
export const CHARACTER_IDS = [
  'baleen',
  'baleen-flash',
  'baleen-kimi',
  'baleen-kimi-halloween',
] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];
// Decorative motions she can play; every one uses the same idle drawing.
export type Look = 'idle' | 'listen' | 'thinking' | 'speak' | 'happy' | 'sad' | 'rest';
/** Normalized viewport position (0..1) of the card's top-left corner. */
export interface Position {
  x: number;
  y: number;
}
// System follows the device; the other two pin a scheme regardless of it.
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const PROVIDERS = ['deepseek', 'moonshot'] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABELS: Record<Provider, string> = {
  deepseek: 'DeepSeek',
  moonshot: 'Kimi',
};
/** Where a provider's requests go; the only hosts the key is ever sent to. */
export const PROVIDER_HOSTS: Record<Provider, string> = {
  deepseek: 'api.deepseek.com',
  moonshot: 'api.moonshot.ai',
};
// The chat models exposed in the UI, keyed by the provider that serves them.
export const MODELS = [
  'deepseek-v4-pro',
  'deepseek-flash',
  'kimi-k3.1-pro',
  'kimi-k3',
] as const;
export type Model = (typeof MODELS)[number];
export const MODEL_PROVIDER: Record<Model, Provider> = {
  'deepseek-flash': 'deepseek',
  'deepseek-v4-pro': 'deepseek',
  'kimi-k3.1-pro': 'moonshot',
  'kimi-k3': 'moonshot',
};
export const MODEL_LABELS: Record<Model, string> = {
  'deepseek-flash': 'DeepSeek Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'kimi-k3.1-pro': 'Kimi K3.1 Pro',
  'kimi-k3': 'Kimi K3',
};
export const MODEL_SHORT: Record<Model, string> = {
  'deepseek-flash': 'DeepSeek Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'kimi-k3.1-pro': 'Kimi K3.1 Pro',
  'kimi-k3': 'Kimi K3',
};
/** The tier hint shown beside a model in both pickers. */
export const MODEL_META: Record<Model, string> = {
  'deepseek-flash': 'Fast',
  'deepseek-v4-pro': 'Stronger',
  'kimi-k3.1-pro': 'Flagship',
  'kimi-k3': 'Previous',
};
export const DEFAULT_MODEL: Model = 'deepseek-flash';
export const providerForModel = (model: Model): Provider => MODEL_PROVIDER[model];
export interface Settings {
  version: 8;
  theme: Theme;
  scale: number;
  hidden: boolean;
  animate: boolean;
  position: Position | null;
  model: Model;
}
export type SettingsPatch = Partial<
  Pick<Settings, 'theme' | 'scale' | 'hidden' | 'animate' | 'position' | 'model'>
>;
export type AskAction = 'chat' | 'talk' | 'summarize' | 'keywords' | 'title';
/** Which conversation family an export or action belongs to. */
export type ChatExportScope = 'talk' | 'study';
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface AskRequest {
  action: AskAction;
  model: Model;
  text: string;
  title: string;
  /** The typed message, for `chat` and `talk`. */
  prompt?: string;
  /** Alt text and captions of images in the selected section; both providers receive text only. */
  images?: string[];
  /** Earlier questions and answers in this inline chat. */
  history?: ChatTurn[];
  /** The reader's editable key: value notes, attached to conversational requests only. */
  notes?: string;
  /** Ask the model to reason first; the chain of thought comes back in `reasoning`. */
  thinking?: boolean;
}
export interface AskResult {
  text: string;
  reasoning?: string;
  usage?: { input: number; output: number };
}
