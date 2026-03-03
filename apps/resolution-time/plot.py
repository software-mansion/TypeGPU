import argparse
import json

import matplotlib.pyplot as plt  # ty: ignore[unresolved-import]
import numpy as np  # ty: ignore[unresolved-import]

parser = argparse.ArgumentParser()
parser.add_argument("--input-file")
parser.add_argument("--output-file")
args = parser.parse_args()

with open(args.input_file, "r") as file:
    data = json.load(file)

x = [d["maxDepth"] for d in data]
y = [d["timeMs"] for d in data]

coefficients = np.polyfit(x, y, deg=2)
polynomial = np.poly1d(coefficients)

x_smooth = np.linspace(min(x), max(x), 100)
y_smooth = polynomial(x_smooth)

plt.scatter(x, y, color="#1f77b4", alpha=0.3, s=60, zorder=5)
plt.plot(x_smooth, y_smooth, color="#ff7f0e", linewidth=2)

plt.ylabel("time (ms)")
plt.grid(True, linestyle="--", alpha=0.6)

plt.savefig(args.output_file, dpi=300, bbox_inches="tight")
