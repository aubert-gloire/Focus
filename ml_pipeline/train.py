# train.py — FocusFlow semantic classifier training pipeline
#
# Usage:
#   python train.py              # trains on built-in synthetic pairs
#   python train.py --out path   # custom output path for weights.json

import sys
import json
import argparse
from pathlib import Path

from feature_engineering import generate_synthetic_data, train_test_split, extract_features
from logistic_regression import LogisticRegression


def main():
    parser = argparse.ArgumentParser(description='Train FocusFlow distraction classifier')
    parser.add_argument('--epochs', type=int,   default=2000, help='Training epochs (default 2000)')
    parser.add_argument('--lr',     type=float, default=0.1,  help='Learning rate (default 0.1)')
    parser.add_argument('--l2',     type=float, default=0.01, help='L2 regularization (default 0.01)')
    parser.add_argument('--out',    type=str,   default='../extension/ml/weights.json',
                        help='Output path for weights.json')
    args = parser.parse_args()

    # ── 1. Load data ──────────────────────────────────────────────────────────
    print("\n--- Step 1: Build dataset -------------------------------------------")
    X, y = generate_synthetic_data()

    # ── 2. Split ──────────────────────────────────────────────────────────────
    print("\n--- Step 2: Train / test split (80 / 20) ----------------------------")
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_ratio=0.2)
    print(f"  Train: {len(X_train)} samples  |  Test: {len(X_test)} samples")

    # ── 3. Train ──────────────────────────────────────────────────────────────
    print(f"\n--- Step 3: Training (lr={args.lr}, epochs={args.epochs}, l2={args.l2}) ---")
    model = LogisticRegression(
        learning_rate=args.lr,
        epochs=args.epochs,
        l2=args.l2
    )
    model.fit(X_train, y_train, verbose=True)

    # ── 4. Evaluate ───────────────────────────────────────────────────────────
    print("\n--- Step 4: Evaluation ----------------------------------------------")
    train_m = model.evaluate(X_train, y_train)
    test_m  = model.evaluate(X_test,  y_test)

    print(f"\n  Train:  acc={train_m['accuracy']:.2%}  f1={train_m['f1']:.3f}  "
          f"precision={train_m['precision']:.3f}  recall={train_m['recall']:.3f}")
    print(f"  Test:   acc={test_m['accuracy']:.2%}  f1={test_m['f1']:.3f}  "
          f"precision={test_m['precision']:.3f}  recall={test_m['recall']:.3f}")
    print(f"  Confusion: TP={test_m['tp']}  TN={test_m['tn']}  "
          f"FP={test_m['fp']}  FN={test_m['fn']}")

    # ── 5. Sanity check on real-world examples ────────────────────────────────
    print("\n--- Step 5: Sanity check on sample task/tab pairs -------------------")
    examples = [
        ("Watching Python tutorial on YouTube",    "youtube.com", "Python Tutorial - YouTube",              "youtube.com"),
        ("Watching Python tutorial on YouTube",    "youtube.com", "Instagram",                              "instagram.com"),
        ("Watching Python tutorial on YouTube",    "youtube.com", "Stack Overflow Python error",            "stackoverflow.com"),
        ("Watching Python tutorial on YouTube",    "youtube.com", "FIFA 24 highlights - YouTube",           "youtube.com"),
        ("Complete week 3 readings on Perusall",   "perusall.com", "Perusall - BIOL 101",                  "perusall.com"),
        ("Complete week 3 readings on Perusall",   "perusall.com", "TikTok",                               "tiktok.com"),
        ("Study machine learning course Coursera", "coursera.org", "Coursera - ML Week 3",                 "coursera.org"),
        ("Study machine learning course Coursera", "coursera.org", "Stack Overflow gradient descent",      "stackoverflow.com"),
        ("Study machine learning course Coursera", "coursera.org", "Twitter",                              "twitter.com"),
        ("Debug Python backend on GitHub",         "github.com",   "Flask documentation",                  "flask.palletsprojects.com"),
        ("Debug Python backend on GitHub",         "github.com",   "Netflix",                              "netflix.com"),
    ]

    print(f"\n  {'Task':<42} {'Tab':<35} {'P(distract)':>12}  Decision")
    print("  " + "-" * 100)
    for task, task_domain, tab_title, tab_domain in examples:
        # Apply hard rules first (mirrors classifyTab in background.js)
        if task_domain and task_domain in tab_domain:
            print(f"  {task:<42} {tab_title:<35} {'—':>12}  allow (task domain)")
            continue
        from feature_engineering import KNOWN_DISTRACTIONS
        if any(d in tab_domain for d in KNOWN_DISTRACTIONS):
            print(f"  {task:<42} {tab_title:<35} {'—':>12}  BLOCK (known distraction)")
            continue
        features = extract_features(task, task_domain, tab_title, tab_domain)
        prob     = model.predict_proba(features)
        decision = "BLOCK" if prob > 0.45 else "allow"
        print(f"  {task:<42} {tab_title:<35} {prob:>12.3f}  {decision}")

    # ── 6. Export weights ─────────────────────────────────────────────────────
    print(f"\n--- Step 6: Export weights -> {args.out} ----------------------")
    weights = model.to_dict()
    weights['_meta'] = {
        'features': [
            'tfidf_relevance',
            'domain_match',
            'is_known_distraction',
            'keyword_overlap',
            'domain_in_task'
        ],
        'n_train':       len(X_train),
        'test_accuracy': test_m['accuracy'],
        'test_f1':       test_m['f1'],
        'threshold':     0.45
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(weights, f, indent=2)

    print(f"  Saved to {out_path.resolve()}")
    print("\nDone. Reload the extension to use the updated model.\n")


if __name__ == '__main__':
    main()
