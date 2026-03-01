import json

import matplotlib.pyplot as plt
import numpy as np

with open("results.json", "r") as file:
    data = json.load(file)

x = [d["maxDepth"] for d in data]
y = [d["timeMs"] for d in data]

coefficients = np.polyfit(x, y, deg=2)
polynomial = np.poly1d(coefficients)

x_smooth = np.linspace(min(x), max(x), 100)
y_smooth = polynomial(x_smooth)

plt.scatter(x, y, color="#1f77b4", alpha=0.3, s=60, label="Resolution Data", zorder=5)
plt.plot(x_smooth, y_smooth, color="#ff7f0e", linewidth=2)

plt.xlabel("Max Depth")
plt.ylabel("Time (ms)")
plt.title("Resolution Time vs Max Depth")
plt.legend()
plt.grid(True, linestyle="--", alpha=0.6)

plt.savefig("plot.png", dpi=300, bbox_inches="tight")
