import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../config/theme';

export interface HeatmapDay {
  date: string; // YYYY-MM-DD in the device time zone
  count: number;
}
export interface Streak {
  current: number;
  longest: number;
  lastSolvedDate: string | null;
}

const WEEKS = 12;
const CELL = 14;
const GAP = 3;

// Pine green (theme.colors.success) at increasing strength.
const shade = (count: number) =>
  count <= 0
    ? theme.colors.surfaceSecondary
    : count === 1
      ? 'rgba(45, 90, 39, 0.35)'
      : count === 2
        ? 'rgba(45, 90, 39, 0.65)'
        : theme.colors.success;

const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
};

/**
 * Streak + compact 12-week activity heatmap (problems logged and
 * re-attempts per day). Columns are weeks (Sunday at the top), newest on
 * the right.
 */
export default function ActivityCard({ streak, heatmap }: { streak?: Streak; heatmap?: HeatmapDay[] }) {
  const days = heatmap ?? [];
  const today = days.at(-1);
  // Start on the Sunday 11 weeks before this week so rows line up by weekday.
  const take = today ? (WEEKS - 1) * 7 + weekday(today.date) + 1 : 0;
  const recent = days.slice(-take);
  const columns: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < WEEKS; i++) {
    const week: (HeatmapDay | null)[] = recent.slice(i * 7, i * 7 + 7);
    while (week.length < 7) week.push(null); // rest of the current week
    columns.push(week);
  }
  const active = recent.filter((d) => d.count > 0).length;

  return (
    <View style={styles.card}>
      <View style={styles.streakRow}>
        <View style={styles.streakItem}>
          <Text style={styles.label}>CURRENT_STREAK</Text>
          <Text style={styles.value}>
            {streak?.current ?? 0}
            <Text style={styles.unit}> {streak?.current === 1 ? 'DAY' : 'DAYS'}</Text>
          </Text>
        </View>
        <View style={[styles.streakItem, styles.streakDivider]}>
          <Text style={styles.label}>LONGEST</Text>
          <Text style={styles.value}>
            {streak?.longest ?? 0}
            <Text style={styles.unit}> {streak?.longest === 1 ? 'DAY' : 'DAYS'}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.grid} accessibilityLabel={`${active} active days in the last ${WEEKS} weeks`}>
        {columns.map((week, i) => (
          <View key={i} style={styles.column}>
            {week.map((d, j) => (
              <View
                key={j}
                style={[
                  styles.cell,
                  d ? { backgroundColor: shade(d.count) } : styles.cellEmpty,
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{active} active days · last {WEEKS} weeks</Text>
        <View style={styles.legend}>
          <Text style={styles.footerText}>Less </Text>
          {[0, 1, 2, 3].map((c) => (
            <View key={c} style={[styles.legendCell, { backgroundColor: shade(c) }]} />
          ))}
          <Text style={styles.footerText}> More</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderTopWidth: 3,
    borderTopColor: theme.colors.success,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  streakRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  streakItem: { flex: 1 },
  streakDivider: {
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.outlineVariant,
    paddingLeft: theme.spacing.md,
  },
  label: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  value: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.display,
    fontSize: theme.typography.fontSizes.xxl,
    fontWeight: theme.typography.fontWeights.bold,
    marginTop: 2,
  },
  unit: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeights.regular,
  },
  grid: {
    flexDirection: 'row',
    alignSelf: 'center',
  },
  column: { marginHorizontal: GAP / 2 },
  cell: {
    width: CELL,
    height: CELL,
    marginVertical: GAP / 2,
    borderRadius: theme.borderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.outlineVariant,
  },
  cellEmpty: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
  },
  legend: { flexDirection: 'row', alignItems: 'center' },
  legendCell: {
    width: 9,
    height: 9,
    marginHorizontal: 1,
    borderRadius: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.outlineVariant,
  },
});
