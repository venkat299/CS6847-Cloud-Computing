"""Model factory for taxi fare regression."""
from __future__ import annotations

from typing import Iterable

import tensorflow as tf


def build_regression_model(
    input_dim: int,
    hidden_units: Iterable[int] = (128, 64, 32),
    learning_rate: float = 1e-3,
    dropout: float = 0.1,
) -> tf.keras.Model:
    model = tf.keras.Sequential(name="taxi_fare_regressor")
    model.add(tf.keras.layers.InputLayer(input_shape=(input_dim,)))

    for idx, units in enumerate(hidden_units):
        model.add(tf.keras.layers.Dense(units, activation="relu", name=f"dense_{idx}"))
        if dropout > 0:
            model.add(tf.keras.layers.Dropout(dropout, name=f"dropout_{idx}"))

    model.add(tf.keras.layers.Dense(1, name="fare_output"))

    optimizer = tf.keras.optimizers.Adam(learning_rate=learning_rate)
    model.compile(
        optimizer=optimizer,
        loss="mse",
        metrics=[
            tf.keras.metrics.MeanAbsoluteError(name="mae"),
            tf.keras.metrics.RootMeanSquaredError(name="rmse"),
        ],
    )
    return model


__all__ = ["build_regression_model"]
