# rn-detector — on-device phishing pipeline (React Native)

JavaScript re-implementation of the Python detector, for the **Intelligent Scanning
Module** of the Universal Secure QR Detector System. The phone never runs Python;
it ships the `.tflite` model **+** this JS. These files mirror `fyp (3).py` exactly.

## Files

| File | Mirrors | Role (report use case 4.4.6) |
|------|---------|------------------------------|
| `preprocess.js` | `fyp (3).py` §3 | char-level encode → model input |
| `whitelist.js`  | `fyp.py` §12   | trusted-domain short-circuit |
| `heuristics.js` | CLAUDE.md / UC 4.4.6 step 6 | **Heuristic Rule filter** (offline) |
| `classifyUrl.js`| `fyp.py` §12 + UC 4.4.6 | orchestration: whitelist → heuristics → CNN → (online API) |

## Pipeline (matches Scan QR Code use case, Table 4.6)

```
decoded URL
   │
   ├─ whitelist?        → SAFE        (skip model)
   ├─ heuristic hit?    → DANGEROUS   (offline rule filter, step 6)
   ├─ 1D-CNN (TFLite)   → SAFE / SUSPICIOUS / DANGEROUS   (step 8, offline)
   └─ Safe Browsing?    → can only ESCALATE, never downgrade (step 8, ONLINE only)
```

Verdict tiers: `prob ≥ 0.80 → DANGEROUS`, `≥ 0.50 → SUSPICIOUS`, else `SAFE`
(`DEPLOY_THRESHOLD = 0.50` for the live app; use `0.45` for report metrics).

## Wiring with react-native-fast-tflite

```js
import { loadTensorflowModel } from 'react-native-fast-tflite';
import { classifyUrl } from './rn-detector/classifyUrl';

// load once (e.g. in a context/provider)
const model = await loadTensorflowModel(
  require('./assets/phishing_1dcnn_multisource (2).tflite')
);

// runModel: Float32Array(200) -> sigmoid phishing probability
const runModel = (input) => model.runSync([input])[0][0];

// per scanned QR:
const result = await classifyUrl(decodedUrl, runModel);
// -> { url, verdict, confidence, source, reason }

// optional online second opinion (only when connected):
const result2 = await classifyUrl(decodedUrl, runModel, {
  safeBrowsing: async (url) => /* call GSB API, return true if flagged */ false,
});
```

> Confirm the input spec against the line Colab prints in section 8:
> `>>> JS feeds input shape=[1, 200] dtype=float32`. If it ever says `int32`,
> change `Float32Array` → `Int32Array` in `preprocess.js`.

## Preprocessing parity (ground truth from Python)

The #1 way a TFLite app silently breaks is JS preprocessing drifting from
training. These vectors are produced by the Python `url_to_idx`; the JS must match:

```
"paypal-login.verify-account.com/secure"
  first 30 idx: [82,67,91,82,67,78,15,78,81,73,75,80,16,88,71,84,75,72,91,15,67,69,69,81,87,80,86,16,69,81]
  nonzero count: 38

"https://www.Google.com/"      (scheme + www. stripped; case preserved → 'G'=41)
  first 30 idx: [41,81,81,73,78,71,16,69,81,79,17,0,0,0,...]
  nonzero count: 11
```

Run `npm test` (Jest, inside the RN app) to check `preprocess.test.js` automatically.

## Setup checklist (Windows)

1. **Node.js LTS** (not installed yet) — required for all RN tooling.
2. **JDK 17** — RN's Android Gradle build needs 17 (this machine has Java 23, which will fail the build).
3. **Android SDK** — present at `%LOCALAPPDATA%\Android\Sdk`; set `ANDROID_HOME` to it.
4. **Samsung A50** — enable Developer Options → USB debugging, connect via USB, accept the RSA prompt. Verify with `adb devices`.
5. Native build required (`npx expo run:android` for an Expo dev build). **Expo Go will not work** — TFLite is a native module.
