

export type Verdict = 'SAFE' | 'SUSPICIOUS' | 'DANGEROUS'; //final judgement
export type Source = 'whitelist' | 'heuristic' | 'model' | 'model+heuristic' | 'model+gsb'; //layer

export interface ClassifyResult { //Output
  url: string;
  verdict: Verdict;
  confidence: number;
  source: Source;
  reason: string;
}

export const DEPLOY_THRESHOLD: number;
export const DANGER_THRESHOLD: number;

export function classifyUrl(
  url: string,
  runModel: (input: Float32Array) => number,
  opts?: { safeBrowsing?: (url: string) => Promise<boolean> }
): Promise<ClassifyResult>;
