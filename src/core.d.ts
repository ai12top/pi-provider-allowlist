export type FilterMode = "allowlist" | "blocklist";
export interface FilterConfig {
  mode: FilterMode;
  providers: string[];
}

export function loadFilterConfig(configPath: string): FilterConfig | null;
export function saveFilterConfig(configPath: string, config: FilterConfig): void;
export function clearFilterConfig(configPath: string): void;
export function isEmptyConfig(config: FilterConfig): boolean;
export function enumerateProviders(
  storePath: string,
  modelsPath: string
): { providers: Set<string>; sawStore: boolean };
export function computeHidden(
  config: FilterConfig | null | undefined,
  allProviders: Set<string> | string[]
): string[];
export function computeVisible(
  config: FilterConfig | null | undefined,
  allProviders: Set<string> | string[]
): string[];
