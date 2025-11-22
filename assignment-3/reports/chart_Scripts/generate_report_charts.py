#!/usr/bin/env python3
"""
Utility script to regenerate the aggregate charts used inside reports/report.md.

The script reads every metrics.json file under reports/reports/architecture-*/
and writes three PNGs into reports/report_assets:
    1. Average epoch time across devices and architectures.
    2. Validation RMSE across devices and architectures.
    3. Mean wall-clock duration per device (averaged over architectures).

Usage (from repo root):
    python reports/chart_Scripts/generate_report_charts.py \
        --metrics-root reports/reports \
        --output-dir reports/report_assets
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import matplotlib

# Use a non-interactive backend so the script works in headless environments.
matplotlib.use("Agg")
import matplotlib.pyplot as plt


DEVICE_ORDER = ["CPU", "GPU", "TPU"]
COLOR_MAP = {
    "CPU": "#1f77b4",
    "GPU": "#ff7f0e",
    "TPU": "#2ca02c",
}


def load_metrics(metrics_root: Path) -> Dict[str, Dict[str, dict]]:
    """Load metrics for each device, keyed by architecture label."""
    metrics: Dict[str, Dict[str, dict]] = {}
    architectures: List[str] = []
    for idx, device in enumerate(["cpu", "gpu", "tpu"]):
        device_path = metrics_root / f"architecture-{device}" / "metrics.json"
        if not device_path.exists():
            raise FileNotFoundError(f"Missing metrics file: {device_path}")
        with device_path.open() as f:
            entries = json.load(f)
        device_metrics = {}
        for entry in entries:
            label = entry["label"].split("-", 1)[1]
            device_metrics[label] = entry
            if idx == 0:
                architectures.append(label)
        metrics[device.upper()] = device_metrics
    # Deduplicate while preserving order.
    deduped: List[str] = []
    seen = set()
    for arch in architectures:
        if arch not in seen:
            deduped.append(arch)
            seen.add(arch)
    metrics["__architectures__"] = deduped  # sentinel entry for later use.
    return metrics


def plot_avg_epoch_time(metrics: Dict[str, Dict[str, dict]], output_dir: Path) -> None:
    architectures = metrics["__architectures__"]
    plt.figure(figsize=(8, 4.5))
    for device in DEVICE_ORDER:
        entries = metrics[device]
        y_vals = [entries[arch]["avg_epoch_time"] for arch in architectures]
        plt.plot(
            architectures,
            y_vals,
            marker="o",
            label=device,
            color=COLOR_MAP[device],
        )
    plt.ylabel("Avg epoch time (s)")
    plt.xlabel("Hidden layer configuration")
    plt.title("Average epoch time across devices and architectures")
    plt.grid(True, linewidth=0.5, alpha=0.4)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "avg_epoch_time_by_device.png", dpi=200)
    plt.close()


def plot_rmse(metrics: Dict[str, Dict[str, dict]], output_dir: Path) -> None:
    architectures = metrics["__architectures__"]
    plt.figure(figsize=(8, 4.5))
    for device in DEVICE_ORDER:
        entries = metrics[device]
        y_vals = [entries[arch]["metrics"]["rmse"] for arch in architectures]
        plt.plot(
            architectures,
            y_vals,
            marker="s",
            label=device,
            color=COLOR_MAP[device],
        )
    plt.ylabel("Validation RMSE")
    plt.xlabel("Hidden layer configuration")
    plt.title("Validation RMSE across devices and architectures")
    plt.grid(True, linewidth=0.5, alpha=0.4)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_dir / "rmse_by_device.png", dpi=200)
    plt.close()


def plot_mean_duration(metrics: Dict[str, Dict[str, dict]], output_dir: Path) -> None:
    plt.figure(figsize=(6, 4))
    means = []
    for device in DEVICE_ORDER:
        durations = [entry["duration_seconds"] for entry in metrics[device].values()]
        means.append(sum(durations) / len(durations))
    plt.bar(DEVICE_ORDER, means, color=[COLOR_MAP[d] for d in DEVICE_ORDER])
    plt.ylabel("Mean training duration (s)")
    plt.title("Mean wall-clock training time by device")
    for idx, value in enumerate(means):
        plt.text(idx, value + 2, f"{value:.1f}s", ha="center", va="bottom", fontsize=9)
    plt.tight_layout()
    plt.savefig(output_dir / "mean_duration_by_device.png", dpi=200)
    plt.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate report charts from metrics JSON files.")
    parser.add_argument(
        "--metrics-root",
        type=Path,
        default=Path("reports") / "reports",
        help="Directory containing architecture-*/metrics.json folders.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("reports") / "report_assets",
        help="Directory where PNG charts will be written.",
    )
    args = parser.parse_args()

    metrics_root = args.metrics_root.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    metrics = load_metrics(metrics_root)

    plot_avg_epoch_time(metrics, output_dir)
    plot_rmse(metrics, output_dir)
    plot_mean_duration(metrics, output_dir)

    print(f"Charts saved in {output_dir}")


if __name__ == "__main__":
    main()
