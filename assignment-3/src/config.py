"""Configuration objects and constants used across the project."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_PATH = PROJECT_ROOT / "data" / "taxi_2013_10k.csv"
DEFAULT_LOG_DIR = PROJECT_ROOT / "runs"
DEFAULT_ARTIFACT_DIR = PROJECT_ROOT / "artifacts"


@dataclass(slots=True)
class DataConfig:
    """Describes the dataset layout and preprocessing knobs."""

    dataset_path: Path = DEFAULT_DATA_PATH
    target_column: str = "fare_amount"
    datetime_column: str = "pickup_datetime"
    raw_feature_columns: Sequence[str] = (
        "pickup_datetime",
        "pickup_longitude",
        "pickup_latitude",
        "dropoff_longitude",
        "dropoff_latitude",
        "passenger_count",
    )
    cleaned_feature_columns: Sequence[str] = (
        "pickup_timestamp",
        "pickup_longitude",
        "pickup_latitude",
        "dropoff_longitude",
        "dropoff_latitude",
        "passenger_count",
    )
    validation_size: float = 0.2
    random_state: int = 7


@dataclass(slots=True)
class OptimizerConfig:
    learning_rate: float = 1e-3
    hidden_units: Sequence[int] = field(default_factory=lambda: (128, 64, 32))
    dropout: float = 0.1


@dataclass(slots=True)
class TrainerConfig:
    batch_size: int = 256
    epochs: int = 50
    patience: int = 5
    log_dir: Path = DEFAULT_LOG_DIR
    artifact_dir: Path = DEFAULT_ARTIFACT_DIR
    device_list: Sequence[str] = field(default_factory=lambda: ("CPU",))


__all__ = [
    "PROJECT_ROOT",
    "DEFAULT_DATA_PATH",
    "DEFAULT_LOG_DIR",
    "DEFAULT_ARTIFACT_DIR",
    "DataConfig",
    "OptimizerConfig",
    "TrainerConfig",
]
