"""Plotting helpers for training diagnostics."""
from __future__ import annotations

from pathlib import Path
from typing import Sequence

import matplotlib.pyplot as plt

from .training import TrainingResult


def _format_label(result: TrainingResult) -> str:
    hidden = "x".join(map(str, result.hidden_units))
    return f"{result.device}-{hidden}".lower()


def plot_histories(results: Sequence[TrainingResult], output_dir: Path) -> None:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    for result in results:
        history = result.history
        if not history:
            continue
        fig, axes = plt.subplots(1, 2, figsize=(10, 4))

        axes[0].plot(history.get("loss", []), label="train")
        axes[0].plot(history.get("val_loss", []), label="val")
        axes[0].set_title("Mean Squared Error (USD²) over Epochs")
        axes[0].set_xlabel("epoch")
        axes[0].set_ylabel("Mean Squared Error (USD²)")
        axes[0].legend()

        axes[1].plot(history.get("mae", []), label="train")
        axes[1].plot(history.get("val_mae", []), label="val")
        axes[1].set_title("Mean Absolute Error (USD) over Epochs")
        axes[1].set_xlabel("epoch")
        axes[1].set_ylabel("Mean Absolute Error (USD)")
        axes[1].legend()

        fig.suptitle(_format_label(result))
        fig.tight_layout()
        fig.savefig(output_dir / f"history_{_format_label(result)}.png", dpi=200)
        plt.close(fig)


def plot_metric_comparison(
    results: Sequence[TrainingResult],
    output_path: Path,
    metric: str = "mae",
) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    labels = [_format_label(r) for r in results]
    values = [r.evaluation.get(metric, float("nan")) for r in results]

    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, values, color="#4e79a7")
    ax.set_ylabel("Mean Absolute Error (USD)")
    ax.set_title("Validation Mean Absolute Error (USD) by Device/Architecture")
    ax.bar_label(bars, fmt="{:.2f} USD")
    fig.autofmt_xdate(rotation=30)
    fig.tight_layout()
    fig.savefig(output_path, dpi=200)
    plt.close(fig)


def plot_device_runtime(
    results: Sequence[TrainingResult],
    output_path: Path,
) -> None:
    """Bar chart comparing total training time per (device, architecture)."""

    labels = [_format_label(r) for r in results]
    durations = [r.duration_seconds for r in results]

    fig, ax = plt.subplots(figsize=(8, 4))
    bars = ax.bar(labels, durations, color="#59a14f")
    ax.set_ylabel("Training Time (seconds)")
    ax.set_title("Total Training Time per Run (seconds)")
    ax.bar_label(bars, fmt="{:.1f} s")
    fig.autofmt_xdate(rotation=30)
    fig.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close(fig)


def plot_architecture_tradeoff(
    results: Sequence[TrainingResult],
    output_path: Path,
    metric: str = "mae",
) -> None:
    """Scatter plot of avg epoch duration vs validation metric across models."""

    avg_epoch_times = [
        r.duration_seconds / max(len(r.history.get("loss", [])), 1) for r in results
    ]
    metric_values = [r.evaluation.get(metric, float("nan")) for r in results]
    labels = [_format_label(r) for r in results]

    fig, ax = plt.subplots(figsize=(6, 4))
    scatter = ax.scatter(avg_epoch_times, metric_values, c="#e15759")
    for x, y, label in zip(avg_epoch_times, metric_values, labels):
        ax.annotate(label, (x, y), textcoords="offset points", xytext=(4, -4), fontsize=8)
    ax.set_xlabel("Average Epoch Duration (seconds)")
    ax.set_ylabel("Mean Absolute Error (USD)")
    ax.set_title("Epoch Duration vs Validation Mean Absolute Error")
    fig.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close(fig)


__all__ = [
    "plot_histories",
    "plot_metric_comparison",
    "plot_device_runtime",
    "plot_architecture_tradeoff",
]
