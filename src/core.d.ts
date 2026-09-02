// core.js 的类型声明（供 index.ts 类型检查）
export function loadAllowlist(configPath: string): string[] | null;
export function enumerateProviders(
  storePath: string,
  modelsPath: string
): { providers: Set<string>; sawStore: boolean };
export function computeHidden(allowlist: string[], providers: Set<string>): string[];
