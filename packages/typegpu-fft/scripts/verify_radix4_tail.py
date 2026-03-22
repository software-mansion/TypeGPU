#!/usr/bin/env python3
"""Numerical check: radix-4 (Bainville) + Stockham tail vs full Stockham radix-2 chain for n=8."""
import numpy as np


def apply_stockham_one_stage(x: np.ndarray, n: int, ns: int) -> np.ndarray:
    half = n // 2
    y = np.zeros(n, dtype=np.complex128)
    for j in range(half):
        k = j % ns
        tw = np.exp(-1j * np.pi * k / ns)
        i0 = j
        i1 = j + half
        u = x[i0]
        t = x[i1] * tw
        v0 = u + t
        v1 = u - t
        j_div_ns = j // ns
        idx_d = j_div_ns * (2 * ns) + (j % ns)
        y[idx_d] = v0
        y[idx_d + ns] = v1
    return y


def apply_radix4_forward(x: np.ndarray, n: int, p: int) -> np.ndarray:
    quarter = n // 4
    T = quarter
    y = np.zeros(n, dtype=np.complex128)
    base = 0
    for i in range(quarter):
        k = i & (p - 1)
        ang = (-np.pi * k) / (2 * p)
        c1 = np.cos(ang)
        sn1 = np.sin(ang)
        tw1 = c1 + 1j * sn1
        tw2 = tw1**2
        tw3 = tw1**3
        i0 = base + i
        i1 = base + i + T
        i2 = base + i + 2 * T
        i3 = base + i + 3 * T
        a0 = x[i0]
        a1 = x[i1] * tw1
        a2 = x[i2] * tw2
        a3 = x[i3] * tw3
        u0 = a0
        u1 = a1
        u2 = a2
        u3 = a3
        v0 = u0 + u2
        v1 = u0 - u2
        v2 = u1 + u3
        du1 = u1 - u3
        v3 = -1j * du1
        y0 = v0 + v2
        y1 = v1 + v3
        y2 = v0 - v2
        y3 = v1 - v3
        out_base = base + ((i - k) << 2) + k
        y[out_base + 0] = y0
        y[out_base + p] = y1
        y[out_base + (p << 1)] = y2
        y[out_base + p + (p << 1)] = y3
    return y


def full_stockham_forward(x: np.ndarray, n: int) -> np.ndarray:
    ns_list = [1 << i for i in range(int(np.log2(n)))]
    cur = x.copy()
    for ns in ns_list:
        cur = apply_stockham_one_stage(cur, n, ns)
    return cur


def mixed_radix4_then_tail(x: np.ndarray, n: int) -> np.ndarray:
    k = int(np.log2(n))
    assert k % 2 == 1
    r4 = k // 2
    p = 1
    cur = x.copy()
    for _ in range(r4):
        cur = apply_radix4_forward(cur, n, p)
        p *= 4
    cur = apply_stockham_one_stage(cur, n, n // 2)
    return cur


def dft_ref(x: np.ndarray, n: int) -> np.ndarray:
    j = np.arange(n)
    k = j.reshape(-1, 1)
    return np.exp(-2j * np.pi * k * j / n) @ x


def check_n(n: int, rng: np.random.Generator) -> None:
    F_ref = np.array([[np.exp(-2j * np.pi * k * j / n) for j in range(n)] for k in range(n)])

    err_max = 0.0
    for inp in range(min(n, 32)):  # spot-check first 32 basis vectors
        x = np.zeros(n, dtype=np.complex128)
        x[inp] = 1.0
        y_mixed = mixed_radix4_then_tail(x, n)
        y_ref = F_ref @ x
        diff = np.linalg.norm(y_mixed - y_ref) / (np.linalg.norm(y_ref) + 1e-15)
        err_max = max(err_max, diff)

    err_stock = 0.0
    for inp in range(min(n, 32)):
        x = np.zeros(n, dtype=np.complex128)
        x[inp] = 1.0
        y_s = full_stockham_forward(x, n)
        y_ref = F_ref @ x
        err_stock = max(err_stock, np.linalg.norm(y_s - y_ref) / (np.linalg.norm(y_ref) + 1e-15))

    print(f"n={n}: full Stockham vs DFT (basis 0..31): {err_stock:.3e}")
    print(f"n={n}: radix4+tail vs DFT (basis 0..31): {err_max:.3e}")

    for t in range(8):
        x = rng.standard_normal(n) + 1j * rng.standard_normal(n)
        y_m = mixed_radix4_then_tail(x, n)
        y_s = full_stockham_forward(x, n)
        y_r = dft_ref(x, n)
        e_m = np.linalg.norm(y_m - y_r) / np.linalg.norm(y_r)
        e_s = np.linalg.norm(y_s - y_r) / np.linalg.norm(y_r)
        print(f"  rand#{t}: mixed {e_m:.3e}  stock {e_s:.3e}")


def main():
    rng = np.random.default_rng(0)
    for n in (8, 32, 128, 512, 2048):
        k = int(np.log2(n))
        if k % 2 == 0:
            continue
        check_n(n, rng)
        print()


if __name__ == "__main__":
    main()
