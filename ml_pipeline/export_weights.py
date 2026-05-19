# export_weights.py — Standalone script to re-export weights without retraining
# Useful when you want to inspect or manually tweak model weights.

import json
from pathlib import Path


def inspect_weights(weights_path: str = '../extension/ml/weights.json'):
    path = Path(weights_path)
    if not path.exists():
        print(f"No weights found at {path}. Run train.py first.")
        return

    with open(path, 'r', encoding='utf-8') as f:
        weights = json.load(f)

    if weights.get('w') is None:
        print("Weights file is empty — run train.py to generate weights.")
        return

    meta      = weights.get('_meta', {})
    features  = meta.get('features', [f'feature_{i}' for i in range(len(weights['w']))])

    print("\n── Model Weights ────────────────────────────────────────────────")
    print(f"  Trained on:    {meta.get('trained_on', 'unknown')}")
    print(f"  Train samples: {meta.get('n_train', '?')}")
    print(f"  Test accuracy: {meta.get('test_accuracy', '?'):.2%}" if meta.get('test_accuracy') else "")
    print(f"  Test F1:       {meta.get('test_f1', '?'):.3f}" if meta.get('test_f1') else "")

    print("\n  Feature weights (positive = more likely distracted):")
    print(f"  {'Feature':<25} {'Weight':>10}  {'Mean':>8}  {'Std':>8}")
    print("  " + "-" * 55)
    for i, (name, w, m, s) in enumerate(
        zip(features, weights['w'], weights['means'], weights['stds'])
    ):
        bar = '█' * int(abs(w) * 20) if abs(w) * 20 >= 1 else '·'
        direction = '+' if w >= 0 else '-'
        print(f"  {name:<25} {w:>+10.4f}  {m:>8.2f}  {s:>8.2f}  {direction}{bar}")

    print(f"\n  Bias: {weights['bias']:+.4f}")
    print()


if __name__ == '__main__':
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else '../extension/ml/weights.json'
    inspect_weights(path)
