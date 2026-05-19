# logistic_regression.py — Logistic Regression trained from scratch
# No scikit-learn. Only Python stdlib + basic math.
# Uses batch gradient descent with L2 regularization.

import math
import random


# ─── Math primitives ──────────────────────────────────────────────────────────

def sigmoid(z: float) -> float:
    # Clamp z to avoid overflow in exp
    z = max(-500, min(500, z))
    return 1.0 / (1.0 + math.exp(-z))

def dot(weights: list[float], features: list[float]) -> float:
    return sum(w * f for w, f in zip(weights, features))


# ─── Normalization (z-score) ──────────────────────────────────────────────────

def compute_mean_std(X: list[list[float]]) -> tuple[list[float], list[float]]:
    n = len(X)
    n_features = len(X[0])
    means = [sum(X[i][j] for i in range(n)) / n for j in range(n_features)]
    stds  = [
        math.sqrt(sum((X[i][j] - means[j]) ** 2 for i in range(n)) / n)
        for j in range(n_features)
    ]
    return means, stds

def normalize(X: list[list[float]], means: list[float], stds: list[float]) -> list[list[float]]:
    return [
        [(x - m) / (s if s != 0 else 1) for x, m, s in zip(row, means, stds)]
        for row in X
    ]


# ─── Logistic Regression ──────────────────────────────────────────────────────

class LogisticRegression:
    """
    Binary logistic regression trained with batch gradient descent + L2 reg.

    Attributes
    ----------
    weights : list[float]
    bias    : float
    means   : list[float]  — stored for inference normalization
    stds    : list[float]
    """

    def __init__(self, learning_rate: float = 0.1, epochs: int = 1000, l2: float = 0.01):
        self.lr      = learning_rate
        self.epochs  = epochs
        self.l2      = l2           # regularization strength
        self.weights = []
        self.bias    = 0.0
        self.means   = []
        self.stds    = []

    def fit(self, X: list[list[float]], y: list[int], verbose: bool = True):
        """Train on feature matrix X and binary labels y (0 or 1)."""
        assert len(X) == len(y), "X and y must have the same length"
        assert len(X) > 0,       "Need at least one training sample"

        n = len(X)
        n_features = len(X[0])

        # Normalize features
        self.means, self.stds = compute_mean_std(X)
        X_norm = normalize(X, self.means, self.stds)

        # Initialize weights to small random values
        random.seed(42)
        self.weights = [random.uniform(-0.01, 0.01) for _ in range(n_features)]
        self.bias    = 0.0

        for epoch in range(self.epochs):
            # Compute predictions
            predictions = [sigmoid(dot(self.weights, x) + self.bias) for x in X_norm]

            # Compute gradients (batch)
            errors = [pred - label for pred, label in zip(predictions, y)]

            grad_w = [
                sum(errors[i] * X_norm[i][j] for i in range(n)) / n
                + self.l2 * self.weights[j]   # L2 penalty
                for j in range(n_features)
            ]
            grad_b = sum(errors) / n

            # Update weights
            self.weights = [w - self.lr * g for w, g in zip(self.weights, grad_w)]
            self.bias   -= self.lr * grad_b

            if verbose and (epoch + 1) % 100 == 0:
                loss = self._log_loss(predictions, y)
                acc  = self._accuracy(predictions, y)
                print(f"  Epoch {epoch+1:>4}/{self.epochs} | loss={loss:.4f} | acc={acc:.2%}")

    def predict_proba(self, x: list[float]) -> float:
        """Return probability of distraction (class 1) for a single sample."""
        x_norm = [(xi - m) / (s if s != 0 else 1) for xi, m, s in zip(x, self.means, self.stds)]
        return sigmoid(dot(self.weights, x_norm) + self.bias)

    def predict(self, x: list[float], threshold: float = 0.5) -> int:
        return int(self.predict_proba(x) >= threshold)

    def evaluate(self, X: list[list[float]], y: list[int]) -> dict:
        probs = [self.predict_proba(x) for x in X]
        preds = [int(p >= 0.5) for p in probs]

        tp = sum(1 for p, l in zip(preds, y) if p == 1 and l == 1)
        tn = sum(1 for p, l in zip(preds, y) if p == 0 and l == 0)
        fp = sum(1 for p, l in zip(preds, y) if p == 1 and l == 0)
        fn = sum(1 for p, l in zip(preds, y) if p == 0 and l == 1)

        accuracy  = (tp + tn) / len(y) if y else 0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        recall    = tp / (tp + fn) if (tp + fn) > 0 else 0
        f1        = (2 * precision * recall / (precision + recall)
                     if (precision + recall) > 0 else 0)

        return {
            'accuracy':  round(accuracy,  4),
            'precision': round(precision, 4),
            'recall':    round(recall,    4),
            'f1':        round(f1,        4),
            'tp': tp, 'tn': tn, 'fp': fp, 'fn': fn
        }

    def _log_loss(self, predictions: list[float], y: list[int]) -> float:
        eps = 1e-9
        return -sum(
            l * math.log(p + eps) + (1 - l) * math.log(1 - p + eps)
            for p, l in zip(predictions, y)
        ) / len(y)

    def _accuracy(self, predictions: list[float], y: list[int]) -> float:
        correct = sum(1 for p, l in zip(predictions, y) if int(p >= 0.5) == l)
        return correct / len(y)

    def to_dict(self) -> dict:
        """Serialize model for export to the browser extension."""
        return {
            'w':     self.weights,
            'bias':  self.bias,
            'means': self.means,
            'stds':  self.stds
        }
