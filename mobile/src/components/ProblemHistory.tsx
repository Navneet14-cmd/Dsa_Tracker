import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { theme } from '../config/theme';

type Entry =
  | { kind: 'attempt'; at: string; id: string; timeTakenMins: number; solvedAlone: boolean; confidence: number; notes: string | null }
  | { kind: 'review'; at: string; id: string; rating: string | null; intervalDays: number };

const RATING_COLORS: Record<string, string> = {
  AGAIN: theme.colors.danger,
  HARD: theme.colors.warning,
  GOOD: theme.colors.success,
  EASY: theme.colors.primaryLight,
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** Revision + re-attempt timeline for one problem (GET /problems/:id/revisions). */
export default function ProblemHistory({ problemId }: { problemId: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api
        .get(`/problems/${problemId}/revisions`)
        .then((res) => !cancelled && (setData(res.data), setError(false)))
        .catch(() => !cancelled && setError(true));
      return () => {
        cancelled = true;
      };
    }, [problemId])
  );

  if (error) return <Text style={styles.empty}>Couldn't load history.</Text>;
  if (!data) return <ActivityIndicator style={{ marginVertical: theme.spacing.md }} color={theme.colors.primary} />;

  const entries: Entry[] = [
    ...(data.attempts ?? []).map((a: any) => ({ kind: 'attempt' as const, at: a.attemptedAt, ...a })),
    ...(data.revisions ?? [])
      .filter((r: any) => r.completed && r.completedAt)
      .map((r: any) => ({ kind: 'review' as const, at: r.completedAt, id: r.id, rating: r.rating, intervalDays: r.intervalDays })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const pending = (data.revisions ?? []).find((r: any) => !r.completed);

  return (
    <View style={styles.card}>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>REVIEWS: <Text style={styles.statValue}>{data.stats?.completedCount ?? 0}</Text></Text>
        <Text style={styles.stat}>RE-ATTEMPTS: <Text style={styles.statValue}>{data.stats?.attemptCount ?? 0}</Text></Text>
        <Text style={styles.stat}>
          NEXT: <Text style={styles.statValue}>{pending ? fmt(pending.scheduledFor) : '—'}</Text>
        </Text>
      </View>

      {entries.length === 0 ? (
        <Text style={styles.empty}>No reviews or re-attempts yet.</Text>
      ) : (
        entries.map((e) => (
          <View key={`${e.kind}-${e.id}`} style={styles.entry}>
            <Text style={styles.date}>{fmt(e.at)}</Text>
            {e.kind === 'attempt' ? (
              <View style={styles.entryBody}>
                <Text style={styles.entryTitle}>Re-attempt</Text>
                <Text style={styles.entryMeta}>
                  {e.timeTakenMins} min · confidence {e.confidence}/5 · {e.solvedAlone ? 'no hints' : 'with hints'}
                </Text>
                {e.notes ? <Text style={styles.entryNotes} numberOfLines={3}>{e.notes}</Text> : null}
              </View>
            ) : (
              <View style={styles.entryBody}>
                <Text style={styles.entryTitle}>
                  Review{' '}
                  {e.rating ? (
                    <Text style={{ color: RATING_COLORS[e.rating] ?? theme.colors.text }}>{e.rating}</Text>
                  ) : null}
                </Text>
                <Text style={styles.entryMeta}>{e.intervalDays}-day interval</Text>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  stat: { color: theme.colors.textSecondary, fontFamily: theme.fonts.mono, fontSize: 10 },
  statValue: { color: theme.colors.text, fontWeight: theme.typography.fontWeights.semibold },
  entry: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
    borderStyle: 'dashed',
  },
  date: { width: 92, color: theme.colors.textSecondary, fontFamily: theme.fonts.mono, fontSize: 11 },
  entryBody: { flex: 1 },
  entryTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
  },
  entryMeta: { color: theme.colors.textSecondary, fontFamily: theme.fonts.mono, fontSize: 11, marginTop: 2 },
  entryNotes: { color: theme.colors.textSecondary, fontFamily: theme.fonts.sans, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  empty: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontStyle: 'italic',
    paddingVertical: theme.spacing.sm,
  },
});
