// The shipped drawings. IDs are the art keys; a model offers one or more of them as costumes.
export const CHARACTER_IDS = [
  'baleen',
  'baleen-flash',
  'baleen-flash-witch',
  'baleen-pro-witch',
  'baleen-kimi',
  'baleen-kimi-halloween',
  'baleen-qwen',
  'baleen-glm',
  'baleen-glm-ghost',
  'baleen-minimax',
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
export const PROVIDERS = ['deepseek', 'moonshot', 'qwen', 'glm', 'minimax'] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABELS: Record<Provider, string> = {
  deepseek: 'DeepSeek',
  moonshot: 'Kimi',
  qwen: 'Qwen',
  glm: 'GLM',
  minimax: 'MiniMax',
};
/** Where a provider's requests go; the only hosts the key is ever sent to. */
export const PROVIDER_HOSTS: Record<Provider, string> = {
  deepseek: 'api.deepseek.com',
  moonshot: 'api.moonshot.ai',
  qwen: 'dashscope-intl.aliyuncs.com',
  glm: 'api.z.ai',
  minimax: 'api.minimax.io',
};
/** Where each provider issues keys; the popup's Get a key link opens this. */
export const PROVIDER_KEY_URLS: Record<Provider, string> = {
  deepseek: 'https://platform.deepseek.com/api_keys',
  moonshot: 'https://platform.moonshot.ai/console/api-keys',
  qwen: 'https://modelstudio.console.alibabacloud.com/',
  glm: 'https://z.ai/manage-apikey/apikey-list',
  minimax: 'https://platform.minimax.io/user-center/basic-information/interface-key',
};
// The chat models exposed in the UI, keyed by the provider that serves them.
export const MODELS = [
  'deepseek-v4-pro',
  'deepseek-flash',
  'kimi-k3.1-pro',
  'qwen3.8-max',
  'glm-5.3',
  'minimax-m3',
] as const;
export type Model = (typeof MODELS)[number];
/**
 * The models with their own drawing, in menu order. Every wired model is here; a model whose art
 * has not shipped yet must be left out so both pickers stay honest.
 */
export const PICKER_MODELS: readonly Model[] = [
  'deepseek-v4-pro',
  'deepseek-flash',
  'kimi-k3.1-pro',
  'qwen3.8-max',
  'glm-5.3',
  'minimax-m3',
];
export const MODEL_PROVIDER: Record<Model, Provider> = {
  'deepseek-flash': 'deepseek',
  'deepseek-v4-pro': 'deepseek',
  'kimi-k3.1-pro': 'moonshot',
  'qwen3.8-max': 'qwen',
  'glm-5.3': 'glm',
  'minimax-m3': 'minimax',
};
export const MODEL_LABELS: Record<Model, string> = {
  'deepseek-flash': 'DeepSeek Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'kimi-k3.1-pro': 'Kimi K3.1 Pro',
  'qwen3.8-max': 'Qwen3.8 Max',
  'glm-5.3': 'GLM-5.3',
  'minimax-m3': 'MiniMax M3',
};
export const MODEL_SHORT: Record<Model, string> = {
  'deepseek-flash': 'DeepSeek Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'kimi-k3.1-pro': 'Kimi K3.1 Pro',
  'qwen3.8-max': 'Qwen3.8 Max',
  'glm-5.3': 'GLM-5.3',
  'minimax-m3': 'MiniMax M3',
};
/** The tier hint shown beside a model in both pickers. */
export const MODEL_META: Record<Model, string> = {
  'deepseek-flash': 'Fast',
  'deepseek-v4-pro': 'Stronger',
  'kimi-k3.1-pro': 'Flagship',
  'qwen3.8-max': 'Flagship',
  'glm-5.3': 'Flagship',
  'minimax-m3': 'Flagship',
};
/** Wire ids differ from the stored keys only where a provider is case-sensitive. */
export const API_MODEL_ID: Record<Model, string> = {
  'deepseek-flash': 'deepseek-flash',
  'deepseek-v4-pro': 'deepseek-v4-pro',
  'kimi-k3.1-pro': 'kimi-k3.1-pro',
  'qwen3.8-max': 'qwen3.8-max',
  'glm-5.3': 'glm-5.3',
  'minimax-m3': 'MiniMax-M3',
};
export const DEFAULT_MODEL: Model = 'deepseek-flash';
export const providerForModel = (model: Model): Provider => MODEL_PROVIDER[model];
export interface Settings {
  version: 9;
  theme: Theme;
  scale: number;
  hidden: boolean;
  animate: boolean;
  position: Position | null;
  model: Model;
  /** The drawing chosen per model; a missing or stale entry falls back to the model's first. */
  outfits: Partial<Record<Model, CharacterId>>;
}
export type SettingsPatch = Partial<
  Pick<Settings, 'theme' | 'scale' | 'hidden' | 'animate' | 'position' | 'model' | 'outfits'>
>;
export type AskAction = 'chat' | 'talk' | 'summarize' | 'keywords' | 'title' | 'wiki';
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
