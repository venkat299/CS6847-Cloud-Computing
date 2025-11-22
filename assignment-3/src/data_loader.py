"""Utilities for reading the NYC taxi fare dataset."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd

from .config import DataConfig


class MissingColumnError(RuntimeError):
    """Raised when the expected columns are not present in the CSV file."""


def _validate_columns(df: pd.DataFrame, expected: Iterable[str]) -> None:
    missing = [col for col in expected if col not in df.columns]
    if missing:
        raise MissingColumnError(
            f"Dataset is missing columns: {', '.join(missing)}; found columns: {list(df.columns)}"
        )


def load_raw_dataframe(config: DataConfig, *, nrows: int | None = None) -> pd.DataFrame:
    """Return a pandas DataFrame with parsed datetime column.

    Args:
        config: Data configuration with CSV path/column metadata.
        nrows: Optional cap useful for smoke tests.
    """

    dataset_path = Path(config.dataset_path)
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset not found at {dataset_path}")

    df = pd.read_csv(
        dataset_path,
        usecols=[*config.raw_feature_columns, config.target_column],
        parse_dates=[config.datetime_column],
        nrows=nrows,
    )
    _validate_columns(df, [*config.raw_feature_columns, config.target_column])
    return df


__all__ = ["load_raw_dataframe", "MissingColumnError"]
