// classifier.js — Logistic Regression inference from scratch
// Weights are trained in Python (ml_pipeline/train.py) and exported as JSON.
// This file only does inference — no training happens in the browser.

// ─── Math primitives ──────────────────────────────────────────────────────────

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function dotProduct(weights, features) {
  if (weights.length !== features.length) return 0;
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += weights[i] * features[i];
  }
  return sum;
}

// ─── Feature normalization ────────────────────────────────────────────────────
// Uses the mean/std saved alongside the weights during training

function normalizeFeatures(features, means, stds) {
  return features.map((val, i) => {
    const std = stds[i] === 0 ? 1 : stds[i];
    return (val - means[i]) / std;
  });
}

// ─── Inference ────────────────────────────────────────────────────────────────
// Returns probability 0.0–1.0 that the user is distracted
// weights shape: { w: number[], bias: number, means: number[], stds: number[] }

function inferDistraction(rawFeatures, weights) {
  if (!weights || !weights.w || !weights.means || !weights.stds) return 0;

  const normalized = normalizeFeatures(rawFeatures, weights.means, weights.stds);
  const z = dotProduct(weights.w, normalized) + weights.bias;
  return sigmoid(z);
}

// ─── Feature definitions (must match ml_pipeline/feature_engineering.py) ──────
//
// Index | Feature               | Description
// ------|-----------------------|----------------------------------------------
//   0   | tfidf_relevance       | TF-IDF + Jaccard score: task vs tab title/domain
//   1   | domain_match          | tab domain contains task URL domain (0 or 1)
//   2   | is_known_distraction  | domain is in known distraction list (0 or 1)
//   3   | keyword_overlap       | fraction of task words found in tab title
//   4   | domain_in_task        | task description mentions tab domain name (0 or 1)
