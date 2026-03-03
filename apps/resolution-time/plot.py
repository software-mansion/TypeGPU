import argparse
import json
import statistics

parser = argparse.ArgumentParser()
parser.add_argument(
    "--input",
    action="append",
    required=True,
    help="label:filepath pair (e.g., 'PR:results.json')",
)
parser.add_argument("--output-file", help="PNG output path")
parser.add_argument("--output-md", help="Markdown output path (Mermaid chart + table)")
parser.add_argument("--title", default="")
args = parser.parse_args()

datasets = []
for pair in args.input:
    label, filepath = pair.split(":", 1)
    with open(filepath, "r") as f:
        data = json.load(f)
    datasets.append({"label": label, "data": data})

if args.output_file:
    import matplotlib.pyplot as plt  # ty: ignore[unresolved-import]
    import numpy as np  # ty: ignore[unresolved-import]

    COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd"]

    fig, ax = plt.subplots(figsize=(10, 6))

    for i, ds in enumerate(datasets):
        x = [d["maxDepth"] for d in ds["data"]]
        y = [d["timeMs"] for d in ds["data"]]
        color = COLORS[i % len(COLORS)]

        ax.scatter(x, y, color=color, alpha=0.3, s=60, zorder=5)

        coefficients = np.polyfit(x, y, deg=2)
        polynomial = np.poly1d(coefficients)
        x_smooth = np.linspace(min(x), max(x), 100)
        y_smooth = polynomial(x_smooth)
        ax.plot(x_smooth, y_smooth, color=color, linewidth=2, label=ds["label"])

    ax.set_ylabel("time (ms)")
    ax.set_xlabel("max depth")
    if args.title:
        ax.set_title(args.title)
    ax.legend()
    ax.grid(True, linestyle="--", alpha=0.6)
    plt.savefig(args.output_file, dpi=300, bbox_inches="tight")

if args.output_md:
    all_depths = sorted(set(d["maxDepth"] for ds in datasets for d in ds["data"]))

    lines = []

    # Mermaid chart
    lines.append("```mermaid")
    lines.append("xychart-beta")
    if args.title:
        lines.append(f'    title "{args.title}"')
    lines.append(f'    x-axis "max depth" [{", ".join(str(d) for d in all_depths)}]')
    lines.append('    y-axis "time (ms)"')

    for ds in datasets:
        medians = []
        for depth in all_depths:
            times = [d["timeMs"] for d in ds["data"] if d["maxDepth"] == depth]
            median = statistics.median(times) if times else 0
            medians.append(f"{median:.2f}")
        lines.append(f"    line [{', '.join(medians)}]")

    lines.append("```")
    lines.append("")

    # Legend (Mermaid xychart-beta doesn't support named series)
    legend_parts = []
    symbols = ["\U0001f535", "\U0001f7e0", "\U0001f7e2", "\U0001f534", "\U0001f7e3"]
    for i, ds in enumerate(datasets):
        legend_parts.append(f"{symbols[i % len(symbols)]} {ds['label']}")
    lines.append(" | ".join(legend_parts))
    lines.append("")

    # Data table
    header = (
        "| max depth | " + " | ".join(f"{ds['label']} (ms)" for ds in datasets) + " |"
    )
    separator = "|---" * (len(datasets) + 1) + "|"
    lines.append(header)
    lines.append(separator)

    for depth in all_depths:
        row = f"| {depth} "
        for ds in datasets:
            times = [d["timeMs"] for d in ds["data"] if d["maxDepth"] == depth]
            median = statistics.median(times) if times else 0
            row += f"| {median:.2f} "
        row += "|"
        lines.append(row)

    with open(args.output_md, "w") as f:
        f.write("\n".join(lines))
