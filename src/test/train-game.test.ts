import { expect, it } from "vitest";
import {
  TRAIN_COLORS,
  isCargoFull,
  isCorrectStation,
  makeCargoTarget,
  makeTrain,
  pickStations,
} from "@/lib/train-game";

/** Deterministic rand: returns the given sequence, then repeats the last value. */
function seq(values: number[]) {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)] ?? 0;
    i += 1;
    return v;
  };
}

it("a train always has a known colour and at least one wagon", () => {
  for (const r of [0, 0.1, 0.5, 0.99, 1]) {
    const t = makeTrain(seq([r, r, r]));
    expect(t.colorIndex).toBeGreaterThanOrEqual(0);
    expect(t.colorIndex).toBeLessThan(TRAIN_COLORS.length);
    expect(t.wagons).toBeGreaterThanOrEqual(1);
    expect(t.wagons).toBeLessThanOrEqual(4);
  }
});

it("station list always contains the train's own colour exactly once", () => {
  for (const count of [3, 4, 5]) {
    const t = makeTrain(seq([0.42, 0.9, 0.1, 0.7, 0.3, 0.55]));
    const stations = pickStations(t, count, seq([0.8, 0.2, 0.6, 0.35, 0.95, 0.05]));
    const hits = stations.filter((s) => s.colorIndex === t.colorIndex);
    expect(hits).toHaveLength(1);
    expect(isCorrectStation(t, hits[0]!)).toBe(true);
  }
});

it("station list has the requested size with no duplicate colours", () => {
  for (const count of [2, 3, 4, 5, 9]) {
    const t = makeTrain(seq([0.3, 0.4, 0.5]));
    const stations = pickStations(t, count, seq([0.1, 0.9, 0.5, 0.7, 0.2, 0.8, 0.35, 0.65]));
    const expected = Math.max(2, Math.min(count, TRAIN_COLORS.length));
    expect(stations).toHaveLength(expected);
    expect(new Set(stations.map((s) => s.colorIndex)).size).toBe(expected);
    stations.forEach((s) => expect(s.label).toBe(TRAIN_COLORS[s.colorIndex]!.name));
  }
});

it("only the matching platform is accepted", () => {
  const t = { colorIndex: 1, wagons: 2 };
  const wrong = pickStations(t, 4, seq([0.9, 0.5, 0.2, 0.7, 0.3])).find(
    (s) => s.colorIndex !== 1,
  )!;
  const right = pickStations(t, 4, seq([0.9, 0.5, 0.2, 0.7, 0.3])).find(
    (s) => s.colorIndex === 1,
  )!;
  expect(isCorrectStation(t, wrong)).toBe(false);
  expect(isCorrectStation(t, right)).toBe(true);
});

it("the loading round asks for a count the train can show", () => {
  for (const max of [3, 4, 5]) {
    for (const r of [0, 0.33, 0.66, 0.99]) {
      const want = makeCargoTarget(seq([r]), max);
      expect(want).toBeGreaterThanOrEqual(1);
      expect(want).toBeLessThanOrEqual(max);
    }
  }
});

it("a wagon count is full only when it reaches the asked number", () => {
  expect(isCargoFull(3, 0)).toBe(false);
  expect(isCargoFull(3, 2)).toBe(false);
  expect(isCargoFull(3, 3)).toBe(true);
  expect(isCargoFull(3, 4)).toBe(true);
});
