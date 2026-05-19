// tfidf.js — TF-IDF + cosine similarity implemented from scratch
// No libraries. This IS the ML for relevance scoring.

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','it','this','that','are','was','be','as','by','from','have','has',
  'not','do','you','your','we','our','they','their','i','my','me','he',
  'she','him','her','its','can','will','just','how','what','when','where',
  'who','which','if','so','than','then','there','about','after','before',
  'up','out','into','http','https','www','com','org','net','html','js'
]);

// ─── Tokenizer ────────────────────────────────────────────────────────────────

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

// ─── Term Frequency ───────────────────────────────────────────────────────────
// TF(term, doc) = count of term in doc / total terms in doc

function termFrequency(tokens) {
  const tf = {};
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1;
  }
  const total = tokens.length || 1;
  for (const term in tf) {
    tf[term] = tf[term] / total;
  }
  return tf;
}

// ─── Inverse Document Frequency ───────────────────────────────────────────────
// IDF(term) = log(N / (1 + df)) where df = docs containing the term

function inverseDocumentFrequency(term, documents) {
  const df = documents.filter(doc => doc.includes(term)).length;
  return Math.log((documents.length + 1) / (1 + df));
}

// ─── TF-IDF Vector ────────────────────────────────────────────────────────────

function tfidfVector(tokens, allDocumentTokenArrays) {
  const tf = termFrequency(tokens);
  const vector = {};
  for (const term in tf) {
    const idf = inverseDocumentFrequency(term, allDocumentTokenArrays);
    vector[term] = tf[term] * idf;
  }
  return vector;
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────
// similarity = (A · B) / (|A| * |B|)

function cosineSimilarity(vecA, vecB) {
  const allTerms = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const term of allTerms) {
    const a = vecA[term] || 0;
    const b = vecB[term] || 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

// ─── Public API ───────────────────────────────────────────────────────────────

// computeRelevance: returns 0.0–1.0 similarity between task and tab context.
//
// Uses TF-IDF cosine similarity as the primary signal. TF-IDF requires word
// overlap; when there is none (e.g. "Study algorithms" vs "Binary search trees")
// the cosine score is 0. In that case we fall back to a simple Jaccard overlap
// on individual characters (bigrams) which catches partial matches.
// When both signals fail, the API fallback in background.js takes over.
function computeRelevance(task, tabContext) {
  const taskTokens = tokenize(task);
  const tabTokens  = tokenize(tabContext);

  if (taskTokens.length === 0 || tabTokens.length === 0) return 0;

  // ── TF-IDF cosine similarity ──────────────────────────────────────────────
  const corpus  = [taskTokens, tabTokens];
  const taskVec = tfidfVector(taskTokens, corpus);
  const tabVec  = tfidfVector(tabTokens,  corpus);
  const tfidfScore = cosineSimilarity(taskVec, tabVec);

  // ── Jaccard token overlap (fallback when no shared full words) ────────────
  // Catches "algorithms" in task matching "algorithm" in tab (singular/plural).
  const taskSet = new Set(taskTokens);
  const tabSet  = new Set(tabTokens);
  const intersection = [...taskSet].filter(t => tabSet.has(t)).length;
  const union        = new Set([...taskSet, ...tabSet]).size;
  const jaccardScore = union > 0 ? intersection / union : 0;

  // ── Substring keyword match (last-resort signal) ──────────────────────────
  // Catches "python" in task matching "python" anywhere in the tab context.
  const tabLower  = tabContext.toLowerCase();
  const keyHits   = taskTokens.filter(t => tabLower.includes(t)).length;
  const keyScore  = taskTokens.length > 0 ? keyHits / taskTokens.length : 0;

  // Combine: prefer TF-IDF but supplement with keyword signals
  return Math.min(1, tfidfScore * 0.5 + jaccardScore * 0.25 + keyScore * 0.25);
}
