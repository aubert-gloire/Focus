# feature_engineering.py — Semantic feature extraction for FocusFlow
#
# Features are derived from the relationship between:
#   - The user's declared task description
#   - The task URL domain (where they said they'd be)
#   - The visited tab's title and domain
#
# No session history or behavioral signals needed.
# These 5 features must stay in sync with classifier.js.

import re
from tfidf import compute_relevance

# ─── Known distraction domains (social / entertainment) ──────────────────────
# Sites that are almost never task-relevant. Kept conservative on purpose —
# YouTube and Reddit are omitted because they can legitimately be task URLs.

KNOWN_DISTRACTIONS = {
    'instagram.com', 'twitter.com', 'x.com', 'facebook.com',
    'tiktok.com', 'snapchat.com', 'pinterest.com', 'messenger.com'
}

# ─── Feature definitions ──────────────────────────────────────────────────────
#
# Index | Name               | Description
# ------|--------------------|--------------------------------------------------
#   0   | tfidf_relevance    | compute_relevance(task, tab_title + domain) 0–1
#   1   | domain_match       | tab domain contains task domain → 0 or 1
#   2   | is_known_distract  | tab domain in KNOWN_DISTRACTIONS → 0 or 1
#   3   | keyword_overlap    | fraction of task words found in tab title 0–1
#   4   | domain_in_task     | task text mentions tab domain name → 0 or 1


def extract_domain_name(domain: str) -> str:
    """Strip TLD to get bare name: 'youtube.com' → 'youtube'."""
    return re.sub(r'\.(com|org|io|net|edu|co|gov|ac|uk).*$', '', domain)


def extract_features(
    task: str,
    task_domain: str,
    tab_title: str,
    tab_domain: str
) -> list[float]:
    task_lower  = task.lower()
    tab_context = (tab_title + ' ' + tab_domain).lower()

    # Feature 0: TF-IDF + Jaccard + keyword composite relevance score
    tfidf_score = compute_relevance(task, tab_context)

    # Feature 1: Tab domain matches the task URL domain
    domain_match = 1.0 if task_domain and tab_domain and task_domain in tab_domain else 0.0

    # Feature 2: Tab is a known distraction site
    is_distraction = 1.0 if any(d in tab_domain for d in KNOWN_DISTRACTIONS) else 0.0

    # Feature 3: Fraction of meaningful task words present in tab title
    task_words = set(w for w in re.findall(r'[a-z]+', task_lower) if len(w) > 2)
    title_lower = tab_title.lower()
    if task_words:
        hits = sum(1 for w in task_words if w in title_lower)
        keyword_overlap = hits / len(task_words)
    else:
        keyword_overlap = 0.0

    # Feature 4: Tab's domain name is mentioned in the task description
    domain_name = extract_domain_name(tab_domain)
    domain_in_task = 1.0 if domain_name and domain_name in task_lower else 0.0

    return [
        float(tfidf_score),
        float(domain_match),
        float(is_distraction),
        float(keyword_overlap),
        float(domain_in_task)
    ]


# ─── Synthetic dataset ────────────────────────────────────────────────────────

# Each entry: (task, task_domain, tab_title, tab_domain, label)
# label 0 = on-task, label 1 = distracted

SYNTHETIC_PAIRS = [
    # ── Watching a tutorial on YouTube ───────────────────────────────────────
    ("Watching Python tutorial on YouTube",    "youtube.com", "Python Tutorial for Beginners - YouTube",          "youtube.com",       0),
    ("Watching Python tutorial on YouTube",    "youtube.com", "Python 3 Official Documentation",                 "docs.python.org",   0),
    ("Watching Python tutorial on YouTube",    "youtube.com", "Stack Overflow - Python list comprehension",      "stackoverflow.com", 0),
    ("Watching Python tutorial on YouTube",    "youtube.com", "W3Schools Python Tutorial",                       "w3schools.com",     0),
    ("Watching Python tutorial on YouTube",    "youtube.com", "Instagram",                                       "instagram.com",     1),
    ("Watching Python tutorial on YouTube",    "youtube.com", "Twitter - Home",                                  "twitter.com",       1),
    ("Watching Python tutorial on YouTube",    "youtube.com", "Netflix - Browse movies",                         "netflix.com",       1),
    ("Watching Python tutorial on YouTube",    "youtube.com", "FIFA 24 gameplay highlights - YouTube",           "youtube.com",       1),
    ("Watching Python tutorial on YouTube",    "youtube.com", "Facebook",                                        "facebook.com",      1),
    ("Watching Python tutorial on YouTube",    "youtube.com", "TikTok - trending videos",                        "tiktok.com",        1),

    # ── Perusall readings ─────────────────────────────────────────────────────
    ("Complete week 3 readings on Perusall",   "perusall.com", "Perusall - BIOL 101 Week 3 Reading",             "perusall.com",      0),
    ("Complete week 3 readings on Perusall",   "perusall.com", "Wikipedia - Cell biology",                       "wikipedia.org",     0),
    ("Complete week 3 readings on Perusall",   "perusall.com", "PubMed - Biology research",                      "ncbi.nlm.nih.gov",  0),
    ("Complete week 3 readings on Perusall",   "perusall.com", "Google Scholar - cell membrane studies",         "scholar.google.com",0),
    ("Complete week 3 readings on Perusall",   "perusall.com", "Instagram",                                      "instagram.com",     1),
    ("Complete week 3 readings on Perusall",   "perusall.com", "Reddit - gaming discussion",                     "reddit.com",        1),
    ("Complete week 3 readings on Perusall",   "perusall.com", "YouTube - music playlist",                       "youtube.com",       1),
    ("Complete week 3 readings on Perusall",   "perusall.com", "TikTok",                                         "tiktok.com",        1),
    ("Complete week 3 readings on Perusall",   "perusall.com", "Twitter trending",                               "twitter.com",       1),

    # ── Coursera machine learning course ─────────────────────────────────────
    ("Study machine learning course on Coursera", "coursera.org", "Machine Learning Week 2 Coursera",            "coursera.org",      0),
    ("Study machine learning course on Coursera", "coursera.org", "Stack Overflow - gradient descent Python",    "stackoverflow.com", 0),
    ("Study machine learning course on Coursera", "coursera.org", "NumPy documentation - array operations",     "numpy.org",         0),
    ("Study machine learning course on Coursera", "coursera.org", "Towards Data Science - neural networks",     "medium.com",        0),
    ("Study machine learning course on Coursera", "coursera.org", "Wikipedia - logistic regression",            "wikipedia.org",     0),
    ("Study machine learning course on Coursera", "coursera.org", "Instagram",                                   "instagram.com",     1),
    ("Study machine learning course on Coursera", "coursera.org", "Twitter",                                     "twitter.com",       1),
    ("Study machine learning course on Coursera", "coursera.org", "Amazon - online shopping",                    "amazon.com",        1),
    ("Study machine learning course on Coursera", "coursera.org", "Netflix - movies and shows",                  "netflix.com",       1),
    ("Study machine learning course on Coursera", "coursera.org", "Facebook",                                    "facebook.com",      1),

    # ── Debugging Python on GitHub ────────────────────────────────────────────
    ("Debug Python backend on GitHub",         "github.com", "GitHub - focusflow backend repository",            "github.com",        0),
    ("Debug Python backend on GitHub",         "github.com", "Stack Overflow - Python AttributeError fix",       "stackoverflow.com", 0),
    ("Debug Python backend on GitHub",         "github.com", "Python docs - exception handling",                 "docs.python.org",   0),
    ("Debug Python backend on GitHub",         "github.com", "Flask documentation - routing",                   "flask.palletsprojects.com", 0),
    ("Debug Python backend on GitHub",         "github.com", "PyPI - package index",                             "pypi.org",          0),
    ("Debug Python backend on GitHub",         "github.com", "Instagram",                                        "instagram.com",     1),
    ("Debug Python backend on GitHub",         "github.com", "YouTube - music playlist",                         "youtube.com",       1),
    ("Debug Python backend on GitHub",         "github.com", "Reddit - funny memes",                             "reddit.com",        1),
    ("Debug Python backend on GitHub",         "github.com", "TikTok",                                           "tiktok.com",        1),
    ("Debug Python backend on GitHub",         "github.com", "Snapchat",                                         "snapchat.com",      1),

    # ── Writing an essay on Google Docs ──────────────────────────────────────
    ("Write climate change essay",             "docs.google.com", "Google Docs - Climate Change Essay",          "docs.google.com",   0),
    ("Write climate change essay",             "docs.google.com", "NASA - climate change data and research",     "climate.nasa.gov",  0),
    ("Write climate change essay",             "docs.google.com", "Wikipedia - climate change overview",         "wikipedia.org",     0),
    ("Write climate change essay",             "docs.google.com", "IPCC sixth assessment report",                "ipcc.ch",           0),
    ("Write climate change essay",             "docs.google.com", "BBC News - climate change article",           "bbc.com",           0),
    ("Write climate change essay",             "docs.google.com", "Instagram",                                   "instagram.com",     1),
    ("Write climate change essay",             "docs.google.com", "Twitter - trending topics",                   "twitter.com",       1),
    ("Write climate change essay",             "docs.google.com", "YouTube - entertainment",                     "youtube.com",       1),
    ("Write climate change essay",             "docs.google.com", "Facebook",                                    "facebook.com",      1),
    ("Write climate change essay",             "docs.google.com", "Pinterest",                                   "pinterest.com",     1),

    # ── Studying algorithms ───────────────────────────────────────────────────
    ("Study algorithms for exam",              "geeksforgeeks.org", "GeeksForGeeks - Binary Search Trees",       "geeksforgeeks.org", 0),
    ("Study algorithms for exam",              "geeksforgeeks.org", "LeetCode - Two Sum problem",                "leetcode.com",      0),
    ("Study algorithms for exam",              "geeksforgeeks.org", "Wikipedia - dynamic programming",           "wikipedia.org",     0),
    ("Study algorithms for exam",              "geeksforgeeks.org", "Stack Overflow - algorithm complexity",     "stackoverflow.com", 0),
    ("Study algorithms for exam",              "geeksforgeeks.org", "HackerRank - practice problems",            "hackerrank.com",    0),
    ("Study algorithms for exam",              "geeksforgeeks.org", "Instagram",                                 "instagram.com",     1),
    ("Study algorithms for exam",              "geeksforgeeks.org", "Twitter",                                   "twitter.com",       1),
    ("Study algorithms for exam",              "geeksforgeeks.org", "Netflix",                                   "netflix.com",       1),
    ("Study algorithms for exam",              "geeksforgeeks.org", "Twitch - gaming streams",                   "twitch.tv",         1),
    ("Study algorithms for exam",              "geeksforgeeks.org", "Facebook",                                  "facebook.com",      1),

    # ── Reading research paper ────────────────────────────────────────────────
    ("Read machine learning research paper",   "arxiv.org", "arXiv - Attention Is All You Need",                "arxiv.org",         0),
    ("Read machine learning research paper",   "arxiv.org", "Google Scholar - deep learning papers",            "scholar.google.com",0),
    ("Read machine learning research paper",   "arxiv.org", "Wikipedia - transformer architecture",             "wikipedia.org",     0),
    ("Read machine learning research paper",   "arxiv.org", "Papers With Code - machine learning",              "paperswithcode.com",0),
    ("Read machine learning research paper",   "arxiv.org", "Instagram",                                        "instagram.com",     1),
    ("Read machine learning research paper",   "arxiv.org", "Twitter",                                          "twitter.com",       1),
    ("Read machine learning research paper",   "arxiv.org", "YouTube - gaming video",                           "youtube.com",       1),
    ("Read machine learning research paper",   "arxiv.org", "TikTok",                                           "tiktok.com",        1),

    # ── Coding project on VS Code / localhost ────────────────────────────────
    ("Build React frontend project",           "localhost", "Stack Overflow - React useState hook",              "stackoverflow.com", 0),
    ("Build React frontend project",           "localhost", "React official documentation",                      "react.dev",         0),
    ("Build React frontend project",           "localhost", "MDN Web Docs - CSS flexbox",                        "developer.mozilla.org", 0),
    ("Build React frontend project",           "localhost", "GitHub - project repository",                       "github.com",        0),
    ("Build React frontend project",           "localhost", "NPM - package registry",                            "npmjs.com",         0),
    ("Build React frontend project",           "localhost", "Instagram",                                         "instagram.com",     1),
    ("Build React frontend project",           "localhost", "Twitter",                                           "twitter.com",       1),
    ("Build React frontend project",           "localhost", "Reddit - funny posts",                              "reddit.com",        1),
    ("Build React frontend project",           "localhost", "Netflix",                                           "netflix.com",       1),
    ("Build React frontend project",           "localhost", "Facebook",                                          "facebook.com",      1),
]


def generate_synthetic_data() -> tuple[list[list[float]], list[int]]:
    """Build (X, y) from SYNTHETIC_PAIRS."""
    X, y = [], []
    for task, task_domain, tab_title, tab_domain, label in SYNTHETIC_PAIRS:
        features = extract_features(task, task_domain, tab_title, tab_domain)
        X.append(features)
        y.append(label)

    on_task = sum(1 for l in y if l == 0)
    distract = sum(1 for l in y if l == 1)
    print(f"Synthetic dataset: {len(X)} samples  |  on-task={on_task}  distracted={distract}")
    return X, y


def train_test_split(X, y, test_ratio=0.2, seed=42):
    import random
    random.seed(seed)
    indices = list(range(len(X)))
    random.shuffle(indices)
    split   = int(len(indices) * (1 - test_ratio))
    train_i = indices[:split]
    test_i  = indices[split:]
    return (
        [X[i] for i in train_i], [X[i] for i in test_i],
        [y[i] for i in train_i], [y[i] for i in test_i]
    )
