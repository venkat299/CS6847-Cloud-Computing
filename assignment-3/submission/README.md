# NYC Taxi Fare Notebook Guide

This directory contains `taxi_fare_notebook.ipynb`, a Colab-friendly notebook that reproduces the assignment workflow end to end. Use it when you prefer point-and-click experimentation (CPU/GPU/TPU) instead of the `src.cli` command-line entry point.

## What the notebook does
- Downloads the 10k-row NYC taxi fare sample from Kaggle (or uses a local upload) and stores it under `/content/data/`.
- Filters out implausible fares/coordinates, engineers the six allowed features, and builds normalized train/validation splits.
- Sweeps through the hidden-layer stacks `[(64,), (64, 32), (64, 32, 16), (64, 32, 16, 8), (64, 32, 16, 4)]` on the selected devices (default `['GPU']`).
- Times every run, tracks MAE/RMSE, plots convergence curves, and prints `model.summary()` so you can cite layer input/output dimensions in the report.
- Saves plots/metrics under `/kaggle/working/reports/architecture` (mirrors the CLI output) and zips them for submission.

## Prerequisites
1. **Runtime**: Google Colab works out of the box. For TPU runs switch via **Runtime → Change runtime type**.
2. **Dataset**: Either keep `train_10k_sample.csv` beside the notebook and upload it to `/content/data/`, or run the KaggleHub cells at the top to pull `zeroslope/taxi-data`.
3. **Dependencies**: The notebook includes commented `pip install` commands (Cells 4-7). Uncomment the lines relevant to your runtime (e.g., `libtpu` for TPU, `tensorflow` for CPU/GPU) before executing.

## Step-by-step execution
1. **Kaggle login (optional)** – Run Cells 0-1 if you need KaggleHub to download the dataset for you.
2. **Runtime packages** – Execute Cells 4-7 to install TensorFlow, TensorBoard, numpy, pandas, scikit-learn, etc. Skip TPU-specific installs when using CPU/GPU only.
3. **Drive mounting (optional)** – Cell 9 shows how to mount Google Drive if your CSV or artifacts live there.
4. **Environment setup** – Cell 11 imports Python packages and initializes constants, while Cell 13 defines preprocessing helpers (value ranges, column names, dataset split utilities).
5. **Data ingestion** – Cell 15 reads the CSV, cleans rows, converts `pickup_datetime` into a timestamp feature, scales the six inputs, and creates batched TensorFlow datasets.
6. **Experiment grid** – Cell 17 declares `devices` and `architectures`. Edit these lists to try different accelerators or hidden-layer stacks.
7. **Training sweeps** – Cell 19 trains one model per (device, architecture) pair using the helper `get_strategy` to select the proper distribution strategy and capture timing stats.
8. **Comparison plots** – Cell 21 aggregates MAE, runtime, and epoch averages to plot trade-offs across architectures/devices.
9. **Input/output dimensions** – Cell 23 builds a reference `(128, 64, 32)` model and prints the full `model.summary()` so you can cite layer dimensions directly.
10. **Artifact export** – Cells 25-26 save metrics, histories, and figures into `/kaggle/working/reports/architecture`, then zip that folder to `reports_gpu.zip` for download.

## Customization tips
- Update `FARE_RANGE`, `LON_RANGE`, `LAT_RANGE`, and `PASSENGER_RANGE` (Cell 13) if you experiment with different data filters.
- To add more architectures, append tuples to `architectures` in Cell 17 (e.g., `(128, 128, 64)`).
- Switch devices by editing the `devices` list; unsupported hardware is skipped gracefully with a log message.
- If you want to persist artifacts locally in Colab, replace `REPORT_DIR = Path(\"/kaggle/working/reports/architecture\")` with a path under `/content/` or mounted Drive.

## Expected outputs
- **Console**: Cleaned-row counts, per-run duration/MAE/RMSE, and a TensorFlow model summary showing each layer's shape.
- **Plots**: Training loss/MAE curves per architecture plus comparison charts for runtime vs. accuracy (located in `reports/architecture/histories`).
- **JSON metrics**: Device/architecture summaries mirroring the CLI pipeline, ready to feed into `reports/report.md`.

Run every cell in order (Runtime → Run all) after configuring the environment. When the final cell finishes you will have a ZIP archive containing everything required for the assignment report.
