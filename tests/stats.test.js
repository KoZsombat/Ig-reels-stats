import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isWatchHistoryFile,
  extractEntries,
  dedupe,
  computeStats,
  dayKey,
} from "../src/stats.js";

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test("matches watch-history file paths across export versions", () => {
  assert.ok(isWatchHistoryFile("ads_information/ads_and_topics/videos_watched.json"));
  assert.ok(isWatchHistoryFile("your_instagram_activity/ads_and_topics/videos_watched.json"));
  assert.ok(!isWatchHistoryFile("ads_information/ads_and_topics/posts_viewed.json"));
  assert.ok(!isWatchHistoryFile("videos_watched.html"));
});

test("parses string_map_data format (seconds)", () => {
  const json = {
    impressions_history_videos_watched: [
      { string_map_data: { Author: { value: "a" }, Time: { timestamp: 1700000000 } } },
      { string_map_data: { Author: { value: "b" }, Time: { timestamp: 1700000100 } } },
    ],
  };
  const e = extractEntries(json);
  assert.equal(e.length, 2);
  assert.equal(e[0].ts, 1700000000 * 1000);
  assert.equal(e[0].author, "a");
});

test("parses label_values format", () => {
  const json = [
    { timestamp: 1715000000, label_values: [{ label: "Owner", value: "zed" }] },
    { timestamp: 1715000500, label_values: [] },
  ];
  const e = extractEntries(json);
  assert.equal(e.length, 2);
  assert.equal(e[0].author, "zed");
});

test("dedupe removes identical entries from overlapping files", () => {
  const e = [{ ts: 1, author: "a" }, { ts: 1, author: "a" }, { ts: 1, author: "b" }];
  assert.equal(dedupe(e).length, 2);
});

test("computeStats zero-fills gaps and averages over all days", () => {
  const entries = [
    { ts: at(2026, 3, 1, 9) },
    { ts: at(2026, 3, 1, 22) },
    { ts: at(2026, 3, 1, 23) },
    { ts: at(2026, 3, 4, 10) },
  ];
  const s = computeStats(entries);
  assert.deepEqual(
    s.days.map((d) => [d.date, d.count]),
    [["2026-03-01", 3], ["2026-03-02", 0], ["2026-03-03", 0], ["2026-03-04", 1]],
  );
  assert.equal(s.total, 4);
  assert.equal(s.avgPerDay, 1);
  assert.equal(s.avgPerActiveDay, 2);
  assert.equal(s.busiest.date, "2026-03-01");
  assert.equal(s.median, 0.5);
});

test("computeStats handles DST transitions and month ends", () => {
  const s = computeStats([{ ts: at(2026, 10, 30) }, { ts: at(2026, 11, 2) }]);
  assert.deepEqual(s.days.map((d) => d.date), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
});

test("lastNDays limits the range", () => {
  const s = computeStats([{ ts: at(2026, 1, 1) }, { ts: at(2026, 1, 10) }], { lastNDays: 3 });
  assert.equal(s.dayCount, 3);
  assert.equal(s.firstDay, "2026-01-08");
  assert.equal(s.total, 1);
});

test("empty input returns null", () => {
  assert.equal(computeStats([]), null);
  assert.equal(dayKey(at(2026, 12, 31)), "2026-12-31");
});
