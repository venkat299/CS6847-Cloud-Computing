"""Training orchestration helpers."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import tensorflow as tf
from tqdm.auto import tqdm
from tqdm.keras import TqdmCallback

from .config import OptimizerConfig, TrainerConfig
from .device_utils import DeviceUnavailableError, build_strategy, stopwatch
from .model_builder import build_regression_model
from .preprocessing import DatasetSplit


@dataclass(slots=True)
class TrainingResult:
    device: str
    hidden_units: tuple[int, ...]
    history: dict[str, list[float]]
    evaluation: dict[str, float]
    duration_seconds: float
    log_dir: Path

    def as_dict(self) -> dict:
        return {
            "device": self.device,
            "hidden_units": list(self.hidden_units),
            "history": self.history,
            "evaluation": self.evaluation,
            "duration_seconds": self.duration_seconds,
            "log_dir": str(self.log_dir),
        }


def _build_datasets(split: DatasetSplit, batch_size: int) -> tuple[tf.data.Dataset, tf.data.Dataset]:
    train_ds = (
        tf.data.Dataset.from_tensor_slices((split.X_train, split.y_train))
        .shuffle(len(split.X_train))
        .batch(batch_size)
        .prefetch(tf.data.AUTOTUNE)
    )
    val_ds = (
        tf.data.Dataset.from_tensor_slices((split.X_val, split.y_val))
        .batch(batch_size)
        .prefetch(tf.data.AUTOTUNE)
    )
    return train_ds, val_ds


def train_single_run(
    split: DatasetSplit,
    optimizer_cfg: OptimizerConfig,
    trainer_cfg: TrainerConfig,
    *,
    hidden_units: Iterable[int],
    device: str,
) -> TrainingResult:
    layers = tuple(int(u) for u in hidden_units)
    strategy = build_strategy(device)

    log_dir = Path(trainer_cfg.log_dir) / f"{device.lower()}_{'-'.join(map(str, layers))}"
    log_dir.parent.mkdir(parents=True, exist_ok=True)

    with strategy.scope():
        model = build_regression_model(
            input_dim=split.X_train.shape[1],
            hidden_units=layers,
            learning_rate=optimizer_cfg.learning_rate,
            dropout=optimizer_cfg.dropout,
        )

    callbacks: list[tf.keras.callbacks.Callback] = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=trainer_cfg.patience,
            restore_best_weights=True,
        ),
        tf.keras.callbacks.TensorBoard(log_dir=str(log_dir), histogram_freq=1),
        TqdmCallback(verbose=0),
    ]

    train_ds, val_ds = _build_datasets(split, trainer_cfg.batch_size)

    with stopwatch(label=f"train_{device}_{layers}") as timer:
        history = model.fit(
            train_ds,
            epochs=trainer_cfg.epochs,
            validation_data=val_ds,
            verbose=0,
            callbacks=callbacks,
        )

    eval_metrics = model.evaluate(val_ds, return_dict=True, verbose=0)

    return TrainingResult(
        device=device,
        hidden_units=layers,
        history=history.history,
        evaluation=eval_metrics,
        duration_seconds=timer.duration_seconds,
        log_dir=log_dir,
    )


def sweep_hidden_units(
    split: DatasetSplit,
    optimizer_cfg: OptimizerConfig,
    trainer_cfg: TrainerConfig,
    *,
    hidden_unit_sets: Sequence[Sequence[int]],
    devices: Sequence[str],
) -> list[TrainingResult]:
    results: list[TrainingResult] = []
    total_runs = len(hidden_unit_sets) * len(devices)
    with tqdm(total=total_runs, desc="Training sweeps") as bar:
        for unit_set in hidden_unit_sets:
            for device in devices:
                try:
                    result = train_single_run(
                        split,
                        optimizer_cfg,
                        trainer_cfg,
                        hidden_units=unit_set,
                        device=device,
                    )
                    results.append(result)
                except DeviceUnavailableError as exc:
                    bar.write(f"Skipping device {device}: {exc}")
                finally:
                    bar.update(1)
    return results


__all__ = ["train_single_run", "sweep_hidden_units", "TrainingResult"]
