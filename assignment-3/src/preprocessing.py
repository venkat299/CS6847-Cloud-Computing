"""Data cleaning and feature engineering helpers."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from .config import DataConfig

FARE_RANGE = (0, 200)
LON_RANGE = (-80, -70)
LAT_RANGE = (35, 45)
PASSENGER_RANGE = (1, 6)


@dataclass(slots=True)
class DatasetSplit:
    X_train: np.ndarray
    X_val: np.ndarray
    y_train: np.ndarray
    y_val: np.ndarray
    scaler: StandardScaler
    feature_names: tuple[str, ...]


def clean_dataframe(df: pd.DataFrame, config: DataConfig) -> pd.DataFrame:
    """Filter obvious outliers and rows with missing data."""

    cleaned = df.dropna().copy()
    cleaned = cleaned[cleaned[config.target_column].between(*FARE_RANGE)]
    cleaned = cleaned[cleaned["pickup_longitude"].between(*LON_RANGE)]
    cleaned = cleaned[cleaned["dropoff_longitude"].between(*LON_RANGE)]
    cleaned = cleaned[cleaned["pickup_latitude"].between(*LAT_RANGE)]
    cleaned = cleaned[cleaned["dropoff_latitude"].between(*LAT_RANGE)]
    cleaned = cleaned[cleaned["passenger_count"].between(*PASSENGER_RANGE)]
    cleaned = cleaned.replace([np.inf, -np.inf], np.nan).dropna()
    return cleaned


def add_pickup_timestamp(df: pd.DataFrame, config: DataConfig) -> pd.DataFrame:
    enriched = df.copy()
    enriched["pickup_timestamp"] = (
        enriched[config.datetime_column].astype("int64") // 10**9
    ).astype("float32")
    return enriched


def build_feature_matrix(
    df: pd.DataFrame,
    config: DataConfig,
    scaler: StandardScaler | None = None,
    *,
    fit_scaler: bool = True,
) -> tuple[np.ndarray, np.ndarray, StandardScaler]:
    feature_frame = df[list(config.cleaned_feature_columns)]
    labels = df[config.target_column].astype("float32")

    scaler = scaler or StandardScaler()
    if fit_scaler:
        features = scaler.fit_transform(feature_frame.astype("float32"))
    else:
        features = scaler.transform(feature_frame.astype("float32"))

    return features, labels.to_numpy(), scaler


def make_train_val_split(
    features: np.ndarray,
    labels: np.ndarray,
    config: DataConfig,
    scaler: StandardScaler,
) -> DatasetSplit:
    X_train, X_val, y_train, y_val = train_test_split(
        features,
        labels,
        test_size=config.validation_size,
        random_state=config.random_state,
    )
    return DatasetSplit(
        X_train=X_train,
        X_val=X_val,
        y_train=y_train,
        y_val=y_val,
        scaler=scaler,
        feature_names=tuple(config.cleaned_feature_columns),
    )


def summarize_dataframe(df: pd.DataFrame, config: DataConfig) -> Dict[str, float]:
    """Return quick stats the README/report can cite."""

    return {
        "rows": float(len(df)),
        "fare_min": float(df[config.target_column].min()),
        "fare_max": float(df[config.target_column].max()),
        "fare_mean": float(df[config.target_column].mean()),
    }


__all__ = [
    "DatasetSplit",
    "clean_dataframe",
    "add_pickup_timestamp",
    "build_feature_matrix",
    "make_train_val_split",
    "summarize_dataframe",
]
