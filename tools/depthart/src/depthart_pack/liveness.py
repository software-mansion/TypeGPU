"""Deterministic interval-based allocation of reusable inference storage slots."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass


class LivenessError(ValueError):
    pass


@dataclass(frozen=True, order=True)
class Interval:
    start: int
    end: int
    tensor_id: str
    byte_length: int
    alignment: int = 256

    def __post_init__(self) -> None:
        if not self.tensor_id:
            raise LivenessError("tensor id cannot be empty")
        if self.start < 0 or self.end < self.start:
            raise LivenessError(f"invalid interval [{self.start}, {self.end}]")
        if self.byte_length <= 0:
            raise LivenessError("byte length must be positive")
        if self.alignment <= 0 or self.alignment & (self.alignment - 1):
            raise LivenessError("alignment must be a positive power of two")


@dataclass(frozen=True)
class Slot:
    id: str
    byte_length: int
    alignment: int


@dataclass(frozen=True)
class Assignment:
    tensor_id: str
    slot_id: str
    start: int
    end: int


@dataclass(frozen=True)
class SlotPlan:
    slots: tuple[Slot, ...]
    assignments: tuple[Assignment, ...]

    @property
    def total_bytes(self) -> int:
        return sum(slot.byte_length for slot in self.slots)


def _align(value: int, alignment: int) -> int:
    return (value + alignment - 1) & -alignment


def plan_slots(
    intervals: Iterable[Interval], *, grow_free_slots: bool = False
) -> SlotPlan:
    """Greedily reuse slots whose previous inclusive interval has ended.

    Selection is best-fit then stable slot ID, making plans reproducible. Slots grow
    only if no free slot already has sufficient capacity.
    """

    ordered = sorted(intervals, key=lambda item: (item.start, item.end, item.tensor_id))
    if len({item.tensor_id for item in ordered}) != len(ordered):
        raise LivenessError("tensor intervals must have unique IDs")
    slots: list[Slot] = []
    last_end: list[int] = []
    assignments: list[Assignment] = []

    for interval in ordered:
        candidates = [
            index
            for index, slot in enumerate(slots)
            if last_end[index] < interval.start
            and slot.byte_length >= interval.byte_length
            and slot.alignment >= interval.alignment
        ]
        if candidates:
            index = min(candidates, key=lambda value: (slots[value].byte_length, value))
        elif grow_free_slots:
            free = [
                index
                for index, slot in enumerate(slots)
                if last_end[index] < interval.start
                and slot.alignment >= interval.alignment
            ]
            new_alignment = max(256, interval.alignment)
            required = _align(interval.byte_length, new_alignment)
            # Growing an already free slot can be cheaper than allocating another
            # one after mixed-width tensors shrink early intervals. Include a new
            # slot as a candidate and minimize incremental arena bytes first.
            grown_lengths = {
                value: _align(interval.byte_length, slots[value].alignment)
                for value in free
            }
            choices = [
                (
                    max(0, grown_lengths[value] - slots[value].byte_length),
                    0,
                    value,
                )
                for value in free
            ]
            choices.append((required, 1, len(slots)))
            _, allocate, index = min(choices)
            if allocate:
                slots.append(
                    Slot(
                        id=f"slot-{index:03d}",
                        byte_length=required,
                        alignment=new_alignment,
                    )
                )
                last_end.append(-1)
            elif grown_lengths[index] > slots[index].byte_length:
                slots[index] = Slot(
                    id=slots[index].id,
                    byte_length=grown_lengths[index],
                    alignment=slots[index].alignment,
                )
        else:
            index = len(slots)
            alignment = max(256, interval.alignment)
            slots.append(
                Slot(
                    id=f"slot-{index:03d}",
                    byte_length=_align(interval.byte_length, alignment),
                    alignment=alignment,
                )
            )
            last_end.append(-1)
        last_end[index] = interval.end
        assignments.append(
            Assignment(
                interval.tensor_id, slots[index].id, interval.start, interval.end
            )
        )
    return SlotPlan(tuple(slots), tuple(assignments))


def intervals_from_dispatches(
    dispatches: Sequence[Mapping[str, object]],
    byte_lengths: Mapping[str, int],
    *,
    persistent_tensors: Iterable[str] = (),
    alignment: int = 256,
) -> tuple[Interval, ...]:
    """Derive live intervals for non-persistent dispatch tensors.

    Inputs are live at the dispatch that produces them through their last consumer;
    a never-consumed output remains live through its producer only. Model input,
    output, and section-backed constants should be passed in `persistent_tensors`.
    """

    persistent = set(persistent_tensors)
    first: dict[str, int] = {}
    last: dict[str, int] = {}
    for index, dispatch in enumerate(dispatches):
        inputs = dispatch.get("inputs")
        outputs = dispatch.get("outputs")
        if not isinstance(inputs, list) or not all(
            isinstance(value, str) for value in inputs
        ):
            raise LivenessError(f"dispatch {index} inputs must be a list of tensor IDs")
        if not isinstance(outputs, list) or not all(
            isinstance(value, str) for value in outputs
        ):
            raise LivenessError(
                f"dispatch {index} outputs must be a list of tensor IDs"
            )
        for tensor_id in inputs:
            last[tensor_id] = index
        for tensor_id in outputs:
            if tensor_id in first:
                raise LivenessError(f"tensor {tensor_id!r} has multiple producers")
            first[tensor_id] = index
            last.setdefault(tensor_id, index)

    intervals: list[Interval] = []
    for tensor_id, start in first.items():
        if tensor_id in persistent:
            continue
        try:
            byte_length = byte_lengths[tensor_id]
        except KeyError as error:
            raise LivenessError(f"missing byte length for {tensor_id!r}") from error
        intervals.append(
            Interval(start, last[tensor_id], tensor_id, byte_length, alignment)
        )
    return tuple(
        sorted(intervals, key=lambda item: (item.start, item.end, item.tensor_id))
    )
