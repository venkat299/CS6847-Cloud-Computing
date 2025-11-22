"""Command line interface for running the taxi fare experiments."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from .config import DataConfig, OptimizerConfig, TrainerConfig
from .data_loader import load_raw_dataframe
from .plotting import (
    plot_architecture_tradeoff,
    plot_device_runtime,
    plot_histories,
    plot_metric_comparison,
)
from .preprocessing import (
    add_pickup_timestamp,
    build_feature_matrix,
    clean_dataframe,
    make_train_val_split,
    summarize_dataframe,
)
from .training import TrainingResult, sweep_hidden_units


def _parse_hidden_sets(raw_values: Sequence[str]) -> list[list[int]]:
    parsed: list[list[int]] = []
    for value in raw_values:
        cleaned = value.replace(" ", "")
        if not cleaned:
            continue
        parsed.append([int(v) for v in cleaned.split(",") if v])
    return parsed or [[128, 64, 32]]


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Train the taxi fare neural network")
    parser.add_argument("--dataset", type=Path, default=None, help="Path to taxi_2013_10k.csv")
    parser.add_argument(
        "--devices",
        type=str,
        nargs="+",
        default=["CPU"],
        help="List of devices to run on (CPU, GPU, TPU)",
    )
    parser.add_argument(
        "--hidden-layer-sets",
        type=str,
        nargs="+",
        default=["128,64,32"],
        help="Space separated list of comma separated hidden layer sizes",
    )
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--patience", type=int, default=5)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--dropout", type=float, default=0.1)
    parser.add_argument("--log-dir", type=Path, default=None, help="TensorBoard log directory")
    parser.add_argument(
        "--artifact-dir",
        type=Path,
        default=None,
        help="Output directory for plots/metrics",
    )
    parser.add_argument(
        "--metrics-json",
        type=Path,
        default=None,
        help="Optional path to dump metrics JSON",
    )
    parser.add_argument(
        "--plot",
        action="store_true",
        help="Enable matplotlib plots for histories and device comparison",
    )
    parser.add_argument(
        "--metric",
        default="mae",
        help="Metric to compare across devices when plotting",
    )
    return parser


def main(args: list[str] | None = None) -> None:
    parser = build_arg_parser()
    cli_args = parser.parse_args(args=args)

    data_cfg = DataConfig()
    if cli_args.dataset:
        data_cfg.dataset_path = cli_args.dataset

    optimizer_cfg = OptimizerConfig(
        learning_rate=cli_args.learning_rate,
        hidden_units=(),  # handled per sweep entry
        dropout=cli_args.dropout,
    )

    trainer_cfg = TrainerConfig(
        batch_size=cli_args.batch_size,
        epochs=cli_args.epochs,
        patience=cli_args.patience,
        log_dir=cli_args.log_dir or data_cfg.dataset_path.parent / "runs",
        artifact_dir=cli_args.artifact_dir or data_cfg.dataset_path.parent / "artifacts",
        device_list=cli_args.devices,
    )

    print(f"Loading dataset from {data_cfg.dataset_path}")
    raw_df = load_raw_dataframe(data_cfg)
    print(f"Loaded {len(raw_df):,} rows")

    cleaned_df = clean_dataframe(raw_df, data_cfg)
    enriched_df = add_pickup_timestamp(cleaned_df, data_cfg)
    features, labels, scaler = build_feature_matrix(enriched_df, data_cfg)
    split = make_train_val_split(features, labels, data_cfg, scaler)

    summary = summarize_dataframe(enriched_df, data_cfg)
    print("Dataset summary:", summary)

    hidden_sets = _parse_hidden_sets(cli_args.hidden_layer_sets)

    results = sweep_hidden_units(
        split,
        optimizer_cfg,
        trainer_cfg,
        hidden_unit_sets=hidden_sets,
        devices=cli_args.devices,
    )

    if cli_args.metrics_json:
        cli_args.metrics_json.parent.mkdir(parents=True, exist_ok=True)
        with cli_args.metrics_json.open("w", encoding="utf-8") as fp:
            json.dump([result.as_dict() for result in results], fp, indent=2)
        print(f"Saved metrics to {cli_args.metrics_json}")

    if cli_args.plot and results:
        artifact_dir = trainer_cfg.artifact_dir
        artifact_dir.mkdir(parents=True, exist_ok=True)
        plot_histories(results, artifact_dir / "histories")
        plot_metric_comparison(results, artifact_dir / f"device_{cli_args.metric}.png", cli_args.metric)
        plot_device_runtime(results, artifact_dir / "device_runtime.png")
        plot_architecture_tradeoff(
            results, artifact_dir / f"architecture_{cli_args.metric}_tradeoff.png", cli_args.metric
        )
        print(f"Plots written to {artifact_dir}")

    for result in results:
        print(
            f"Device={result.device}, layers={result.hidden_units}, "
            f"val_mae={result.evaluation.get('mae', float('nan')):.2f}, "
            f"time={result.duration_seconds:.1f}s",
        )


if __name__ == "__main__":
    main()
