export const levels = ["easy", "medium", "hard"];
export function analyzePerformance(records) {
  const subjects = Object.create(null),
    difficulties = Object.create(null);
  let correct = 0,
    total = 0,
    elapsed = 0;
  for (const r of records) {
    correct += r.correct;
    total += r.total;
    elapsed += r.durationSeconds;
    for (const q of r.items) {
      for (const [map, key] of [
        [subjects, q.topic],
        [difficulties, q.difficulty],
      ]) {
        map[key] ??= { correct: 0, total: 0 };
        map[key].total++;
        map[key].correct += Number(q.correct);
      }
    }
  }
  for (const map of [subjects, difficulties])
    for (const x of Object.values(map))
      x.accuracy = Math.round((100 * x.correct) / x.total);
  const weakSubjects = Object.entries(subjects)
    .filter(([, v]) => v.accuracy < 60)
    .map(([topic, v]) => ({ topic, ...v }))
    .sort((a, b) => a.accuracy - b.accuracy || b.total - a.total);
  const latest = records[0];
  let nextDifficulty = latest?.difficulty || "medium";
  if (latest) {
    const i = levels.indexOf(nextDifficulty);
    nextDifficulty =
      levels[
        Math.max(
          0,
          Math.min(
            2,
            i + (latest.accuracy >= 80 ? 1 : latest.accuracy < 60 ? -1 : 0),
          ),
        )
      ];
  }
  return {
    attempts: records.length,
    correct,
    incorrect: total - correct,
    total,
    accuracy: total ? Math.round((100 * correct) / total) : null,
    durationSeconds: elapsed,
    subjects,
    difficulties,
    weakSubjects,
    nextDifficulty,
    progress: records
      .slice(0, 20)
      .reverse()
      .map((r) => ({
        at: r.createdAt,
        accuracy: r.accuracy,
        subject: r.subject,
      })),
  };
}
export function recommend(profile, analytics) {
  const topic = analytics.weakSubjects[0]?.topic || profile?.subjects?.[0];
  if (!topic) return [];
  return [
    {
      topic,
      difficulty: analytics.nextDifficulty,
      activity: analytics.weakSubjects.length ? "revision" : "quiz",
      source: "performance-engine",
      explanation: `${analytics.weakSubjects.length ? "Revise " + topic + " because accuracy is below 60%." : analytics.attempts ? "Continue " + topic + " based on your latest quiz performance." : "Start " + topic + " from your selected learning subjects."} ${profile?.interests?.length ? "Your selected interests can provide engaging examples." : ""}`,
    },
  ];
}
