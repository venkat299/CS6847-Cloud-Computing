# Assignment 3 – NYC Taxi Fare Prediction

This repository contains a modular TensorFlow pipeline for predicting NYC taxi fares using the provided
`data/taxi_2013_10k.csv` sample (~10k rows). The code follows the assignment requirements:

- Uses TensorFlow graphs and TensorBoard logging.
- Keeps scripts modular (`src/` packages handle loading, preprocessing, modeling, training, plotting).
- Restricts the input layer to the six specified features
  (`pickup_datetime`, pickup/dropoff longitude & latitude, passenger count) by converting
  `pickup_datetime` into a single timestamp feature.
- Supports experimentation across CPU, GPU, and TPU along with hidden-layer sweeps to study
  training-time vs. accuracy trade-offs.

## Repository layout

```
assignment-3/
├── data/                     # datasets supplied by the course (10k sample used here)
├── instructions.md           # original assignment brief
├── requirements.txt          # Python dependencies
├── README.md                 # this document
└── src/
    ├── cli.py                # entry point (python -m src.cli ...)
    ├── config.py             # dataclasses for dataset + trainer settings
    ├── data_loader.py        # CSV reader with column validation
    ├── device_utils.py       # strategy selection + timing helpers
    ├── model_builder.py      # TensorFlow Sequential model factory
    ├── plotting.py           # matplotlib visualizations
    ├── preprocessing.py      # cleaning, feature engineering, scaling
    └── training.py           # high-level training / evaluation orchestration
```

## Environment setup

TensorFlow 2.x currently supports Python up to 3.12. If your system default is newer
(e.g., macOS 3.14 in the error above), install Python 3.10 or 3.11 first. With `pyenv`:

```bash
pyenv install 3.10.14
pyenv local 3.10.14
```

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

On Apple Silicon macOS the requirements automatically pull in `tensorflow-macos`
and `tensorflow-metal`, so no extra manual steps are needed once the supported Python
version is active.

## Running a baseline experiment (CPU)

```bash
python -m src.cli \
  --dataset data/taxi_2013_10k.csv \
  --devices CPU \
  --hidden-layer-sets 128,64,32 \
  --epochs 30 \
  --batch-size 256 \
  --plot \
  --artifact-dir artifacts \
  --metrics-json artifacts/metrics_cpu.json
```

Outputs:

- TensorBoard logs: `runs/cpu-128-64-32` (view with `tensorboard --logdir runs`).
- Plots: `artifacts/histories/…` for training curves and `artifacts/device_mae.png` for device comparison.
- Metrics JSON summarizing MAE/RMSE, runtime, and layer config.

## Comparing CPU vs GPU vs TPU

1. Ensure the chosen runtime provides the accelerators (e.g., Google Colab GPU/TPU runtimes).
2. Run the CLI separately for each device (or pass multiple devices at once):

```bash
python -m src.cli \
  --dataset data/taxi_2013_10k.csv \
  --devices CPU GPU TPU \
  --hidden-layer-sets 128,64,32 \
  --epochs 20 \
  --plot \
  --artifact-dir artifacts/device_comparison
```

The script automatically:
- Selects the requested device via `tf.distribute` strategies (with informative skips if unavailable).
- Records wall-clock training time for every run.
- Saves comparison plots (validation MAE, runtime) so you can discuss execution-time differences
  between CPU/GPU/TPU in your report.

## Exploring model depth/width effects

Pass multiple hidden-layer configurations to `--hidden-layer-sets` (space separated, comma-delimited units):

```bash
python -m src.cli \
  --dataset data/taxi_2013_10k.csv \
  --devices CPU \
  --hidden-layer-sets 64,32 128,64,32 256,256,128,64 \
  --epochs 40 \
  --plot \
  --artifact-dir artifacts/depth_sweep
```

The resulting plots/metrics let you explain how deeper or wider networks impact epoch time and validation
accuracy (e.g., more layers typically increase runtime but can reduce MAE until overfitting appears).

## TensorBoard graph inspection

Launch TensorBoard to visualize the computation graph, scalars, and histograms:

```bash
tensorboard --logdir runs
```

Within TensorBoard you can capture screenshots for the report section discussing TensorFlow as a graph
processing engine.

## Notes & tips

- The preprocessing module filters implausible coordinates, fares, and passenger counts, then converts
  the pickup timestamp to seconds since epoch so the first dense layer receives six inputs of size 6×1.
- All tensors are standardized via `sklearn.StandardScaler`; the fitted scaler is stored inside the
  dataset split for potential reuse (e.g., serializing or transforming new samples).
- Default optimizer: Adam with configurable learning rate/dropout. Early stopping (patience=5) avoids
  unnecessary epochs.
- The code is intentionally split across small modules to stay within the “no long single file” rule.
- For TPU runs on Colab, add `--devices TPU`. The script will initialize TPU systems automatically;
  if TPUs are absent the run is skipped with a clear log message.

## Reporting checklist

Use the produced artifacts to address the evaluation criteria:

- **Input/output dimensions:** Use the `model.summary()` output (shown in the console) to state that
  the first layer expects `(None, 6)` and the final prediction layer outputs `(None, 1)`.
- **CPU vs GPU vs TPU execution time:** Reference the console timings or `artifacts/device_mae.png`.
- **Hidden-layer impact:** Compare the histories stored in `artifacts/histories/` for different
  layer configs to discuss epoch duration vs. MAE/RMSE changes.
- **TensorBoard evidence:** Include screenshots of the graph and scalar dashboards.

This setup should give you everything needed to complete the assignment write-up quickly.
