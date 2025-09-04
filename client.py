#!/usr/bin/env python3
import argparse
import time
from typing import List

import requests

ROLL_NUMBER = "DA24C021"
INPUT_STRINGS: List[str] = [
    "5PKOHcL6OuxRd0xXHQ",
    "JHfJtF8Q",
    "gZFEMlas2JA",
    "NkmPg9j7zMjgnV9",
    "lV0NTN5",
    "tcYvn336dS79R4l",
    "H497kD3k3V1",
    "5ygYRpEEN7sgyuS",
    "kF7ywn7gFk",
    "kfQ7?wB0Lh",
]


def send_and_measure(base_url: str, text: str):
    start = time.perf_counter()
    resp = requests.get(f"{base_url}/reverse", params={"input": text})
    resp.raise_for_status()
    duration_ms = (time.perf_counter() - start) * 1000
    data = resp.json()
    return data.get("reversed", ""), duration_ms


def main():
    parser = argparse.ArgumentParser(description="Send strings to /reverse and record timings")
    parser.add_argument("url", help="Base URL of the server, e.g. http://localhost:3000")
    parser.add_argument("mode", choices=["dockerswarm", "kubernetes"], help="Environment label")
    parser.add_argument("count", type=int, choices=[10, 10000], help="Number of strings to send")
    args = parser.parse_args()

    if args.count == 10:
        payloads = INPUT_STRINGS
    else:
        repeats = (args.count + len(INPUT_STRINGS) - 1) // len(INPUT_STRINGS)
        payloads = (INPUT_STRINGS * repeats)[: args.count]

    total = 0.0
    results = []
    for text in payloads:
        reversed_text, t = send_and_measure(args.url, text)
        total += t
        results.append((text, reversed_text, t))

    avg = total / len(payloads)
    filename = f"{ROLL_NUMBER}{args.mode}{args.count}.txt"
    with open(filename, "w", encoding="utf-8") as f:
        if args.count == 10:
            for original, reversed_text, _ in results:
                f.write(f"Original: {original}\n")
                f.write(f"Reversed: {reversed_text}\n")
                f.write("--------------------------------\n")
        f.write(f"average_response_time={avg}\n")
    print(f"Wrote {filename} with average {avg:.2f} ms")


if __name__ == "__main__":
    main()
