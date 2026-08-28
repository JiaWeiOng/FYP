
import { encodeForModel } from './preprocess';
import { isWhitelisted } from './whitelist';
import { runHeuristics } from './heuristics';

export const DEPLOY_THRESHOLD = 0.5; // live app: fewer false alarms (use 0.45 for reporting)
export const DANGER_THRESHOLD = 0.8;

function tier(prob) {
  if (prob >= DANGER_THRESHOLD) return 'DANGEROUS';
  if (prob >= DEPLOY_THRESHOLD) return 'SUSPICIOUS';
  return 'SAFE';
}

/**
 * Classify a URL (e.g. one decoded from a QR code).
 *
 * @param {string}   url       the URL to check
 * @param {function} runModel  (Float32Array length 200) => number
 *                             returns the sigmoid phishing probability in [0, 1]
 * @param {object}   [opts]
 * @param {function} [opts.safeBrowsing]  async (url) => boolean — true if GSB flags it
 * @returns {Promise<{url, verdict, confidence, source, reason}>}
 */
export async function classifyUrl(url, runModel, opts = {}) {
  // 1. whitelist — trusted, skip the model
  if (isWhitelisted(url)) {
    console.log('[GSB] not reached — URL is whitelisted (SAFE before model/GSB):', url);
    return { url, verdict: 'SAFE', confidence: 0, source: 'whitelist', reason: 'trusted domain' };
  }

  // 2. heuristics
  const h = runHeuristics(url);
  if (h.level === 'dangerous') {
    // obvious attack — block before the model
    console.log('[GSB] not reached — heuristic flagged DANGEROUS before model/GSB:', h.reasons.join('; '));
    return { url, verdict: 'DANGEROUS', confidence: 1, source: 'heuristic', reason: h.reasons.join('; ') };
  }

  // 3. 1D-CNN model
  const prob = runModel(encodeForModel(url));
  let verdict = tier(prob);
  let source = 'model';
  let reason = 'CNN score';

  // A 'suspicious' host signal (e.g. phishing hosted on object storage) is exactly
  // the attack class a URL-only model can't see — warn even if the score looks safe.
  if (h.level === 'suspicious' && verdict === 'SAFE') {
    verdict = 'SUSPICIOUS';
    source = 'model+heuristic';
    reason = h.reasons.join('; ');
  }

  let result = {
    url,
    verdict,
    confidence: Number(prob.toFixed(4)),
    source,
    reason,
  };

  // 4. optional Google Safe Browsing — can only escalate, never downgrade
  console.log('[GSB] online-check step reached | safeBrowsing provided:', !!opts.safeBrowsing, '(if false -> offline, the scanner skipped it)');
  if (opts.safeBrowsing) {
    try {
      const flagged = await opts.safeBrowsing(url);
      if (flagged && result.verdict !== 'DANGEROUS') {
        result = { ...result, verdict: 'DANGEROUS', source: 'model+gsb', reason: 'Google Safe Browsing match' };
      }
    } catch (e) {
      // GSB is best-effort: a network error must never change the model's verdict
    }
  }

  return result;
}
