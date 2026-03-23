export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const rand = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

export const uid = (): string => `${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;

export const average = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};
