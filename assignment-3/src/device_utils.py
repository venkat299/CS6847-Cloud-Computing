"""Helpers for selecting TensorFlow devices and distribution strategies."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from time import perf_counter
from typing import Iterator

import tensorflow as tf


class DeviceUnavailableError(RuntimeError):
    """Raised when the requested accelerator is not present."""


def normalize_device_name(device: str) -> str:
    return device.strip().upper()


def build_strategy(device: str) -> tf.distribute.Strategy:
    normalized = normalize_device_name(device)
    if normalized == "CPU":
        return tf.distribute.OneDeviceStrategy(device="CPU")

    if normalized == "GPU":
        gpus = tf.config.list_physical_devices("GPU")
        if not gpus:
            raise DeviceUnavailableError("No GPU detected for the current runtime")
        return tf.distribute.OneDeviceStrategy(device="GPU:0")

    if normalized == "TPU":
        try:
            resolver = tf.distribute.cluster_resolver.TPUClusterResolver()
            tf.config.experimental_connect_to_cluster(resolver)
            tf.tpu.experimental.initialize_tpu_system(resolver)
            return tf.distribute.TPUStrategy(resolver)
        except (ValueError, RuntimeError) as exc:
            raise DeviceUnavailableError("TPU is not available in this environment") from exc

    raise ValueError(f"Unsupported device '{device}'. Use CPU, GPU, or TPU.")


@dataclass(slots=True)
class TimedBlock:
    label: str
    duration_seconds: float


@contextmanager
def stopwatch(label: str) -> Iterator[TimedBlock]:
    start = perf_counter()
    block = TimedBlock(label=label, duration_seconds=0.0)
    try:
        yield block
    finally:
        block.duration_seconds = perf_counter() - start


__all__ = ["build_strategy", "DeviceUnavailableError", "stopwatch", "TimedBlock"]
