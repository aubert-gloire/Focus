# tfidf.py — TF-IDF vectorizer implemented from scratch using only Python stdlib
# No scikit-learn, no numpy for the algorithm itself. Pure math.

import math
import re

STOP_WORDS = {
    'a','an','the','and','or','but','in','on','at','to','for','of','with',
    'is','it','this','that','are','was','be','as','by','from','have','has',
    'not','do','you','your','we','our','they','their','i','my','me','he',
    'she','him','her','its','can','will','just','how','what','when','where',
    'who','which','if','so','than','then','there','about','after','before',
    'up','out','into','http','https','www','com','org','net','html','js'
}


# ─── Tokenizer ────────────────────────────────────────────────────────────────

def tokenize(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    tokens = text.split()
    return [t for t in tokens if len(t) > 1 and t not in STOP_WORDS]


# ─── Term Frequency ───────────────────────────────────────────────────────────

def term_frequency(tokens: list[str]) -> dict[str, float]:
    tf = {}
    for token in tokens:
        tf[token] = tf.get(token, 0) + 1
    total = len(tokens) or 1
    return {term: count / total for term, count in tf.items()}


# ─── Inverse Document Frequency ───────────────────────────────────────────────

def inverse_document_frequency(term: str, corpus: list[list[str]]) -> float:
    df = sum(1 for doc in corpus if term in doc)
    return math.log((len(corpus) + 1) / (1 + df))


# ─── TF-IDF Vector ────────────────────────────────────────────────────────────

def tfidf_vector(tokens: list[str], corpus: list[list[str]]) -> dict[str, float]:
    tf = term_frequency(tokens)
    return {
        term: tf_val * inverse_document_frequency(term, corpus)
        for term, tf_val in tf.items()
    }


# ─── Cosine Similarity ────────────────────────────────────────────────────────

def cosine_similarity(vec_a: dict, vec_b: dict) -> float:
    all_terms = set(vec_a) | set(vec_b)
    dot  = sum(vec_a.get(t, 0) * vec_b.get(t, 0) for t in all_terms)
    mag_a = math.sqrt(sum(v ** 2 for v in vec_a.values()))
    mag_b = math.sqrt(sum(v ** 2 for v in vec_b.values()))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# ─── Public API ───────────────────────────────────────────────────────────────

def compute_relevance(task: str, tab_context: str) -> float:
    """
    Return 0.0–1.0 relevance between a declared task and a tab's context.

    Combines three signals:
      1. TF-IDF cosine similarity (requires word overlap)
      2. Jaccard token overlap    (partial-word matching)
      3. Substring keyword match  (catches plurals, substrings)
    """
    task_tokens = tokenize(task)
    tab_tokens  = tokenize(tab_context)

    if not task_tokens or not tab_tokens:
        return 0.0

    # 1. TF-IDF cosine
    corpus   = [task_tokens, tab_tokens]
    task_vec = tfidf_vector(task_tokens, corpus)
    tab_vec  = tfidf_vector(tab_tokens,  corpus)
    tfidf_score = cosine_similarity(task_vec, tab_vec)

    # 2. Jaccard token overlap
    task_set  = set(task_tokens)
    tab_set   = set(tab_tokens)
    inter     = len(task_set & tab_set)
    union     = len(task_set | tab_set)
    jaccard   = inter / union if union else 0.0

    # 3. Substring keyword match
    tab_lower  = tab_context.lower()
    key_hits   = sum(1 for t in task_tokens if t in tab_lower)
    key_score  = key_hits / len(task_tokens) if task_tokens else 0.0

    return min(1.0, tfidf_score * 0.5 + jaccard * 0.25 + key_score * 0.25)


# ─── Demo ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    examples = [
        ("Study algorithms exam",    "GeeksForGeeks Binary Search Trees"),
        ("Study algorithms exam",    "Twitter trending memes funny"),
        ("Write climate change essay","NASA climate research carbon emissions"),
        ("Write climate change essay","Reddit gaming discussion"),
        ("Debug Python backend code", "Stack Overflow Python error handling"),
        ("Debug Python backend code", "YouTube music playlist"),
    ]

    print(f"{'Task':<35} {'Tab Context':<40} Score")
    print("-" * 85)
    for task, tab, in examples:
        score = compute_relevance(task, tab)
        flag  = "✓" if score >= 0.15 else "✗"
        print(f"{task:<35} {tab:<40} {score:.3f} {flag}")
