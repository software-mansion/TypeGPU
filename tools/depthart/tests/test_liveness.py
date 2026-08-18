from __future__ import annotations

import pytest

from depthart_pack.liveness import (
    Interval,
    LivenessError,
    intervals_from_dispatches,
    plan_slots,
)


def test_inclusive_intervals_reuse_only_after_last_read() -> None:
    plan = plan_slots(
        [
            Interval(0, 2, "a", 100),
            Interval(1, 1, "b", 80),
            Interval(2, 4, "c", 90),
            Interval(3, 3, "d", 90),
        ]
    )
    assignment = {value.tensor_id: value.slot_id for value in plan.assignments}

    assert assignment["a"] != assignment["c"]
    assert assignment["a"] == assignment["d"]
    assert all(slot.byte_length % slot.alignment == 0 for slot in plan.slots)


def test_intervals_derive_from_dispatch_producer_and_last_consumer() -> None:
    dispatches = [
        {"inputs": ["input"], "outputs": ["a"]},
        {"inputs": ["a"], "outputs": ["b"]},
        {"inputs": ["a", "b"], "outputs": ["output"]},
    ]
    intervals = intervals_from_dispatches(
        dispatches,
        {"a": 64, "b": 64, "output": 64},
        persistent_tensors={"output"},
    )
    assert intervals == (
        Interval(0, 2, "a", 64),
        Interval(1, 2, "b", 64),
    )


def test_mixed_width_plan_can_grow_a_free_slot_deterministically() -> None:
    intervals = [
        Interval(0, 0, "half-early", 256),
        Interval(1, 1, "full-late", 512),
    ]
    baseline = plan_slots(intervals)
    grown = plan_slots(intervals, grow_free_slots=True)

    assert len(baseline.slots) == 2
    assert len(grown.slots) == 1
    assert grown.slots[0].byte_length == 512
    assert {item.slot_id for item in grown.assignments} == {"slot-000"}


def test_multiple_producers_fail() -> None:
    with pytest.raises(LivenessError, match="multiple producers"):
        intervals_from_dispatches(
            [
                {"inputs": ["input"], "outputs": ["x"]},
                {"inputs": ["input"], "outputs": ["x"]},
            ],
            {"x": 4},
        )
