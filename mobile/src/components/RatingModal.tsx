import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { theme } from '../config/theme';

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type NextIntervals = Record<Rating, number | null>;

const OPTIONS: { rating: Rating; label: string; hint: string; color: string }[] = [
  { rating: 'again', label: 'Again', hint: 'Forgot it', color: theme.colors.danger },
  { rating: 'hard', label: 'Hard', hint: 'Struggled', color: theme.colors.warning },
  { rating: 'good', label: 'Good', hint: 'Got it', color: theme.colors.success },
  { rating: 'easy', label: 'Easy', hint: 'Trivial', color: theme.colors.primaryLight },
];

/** "1 day", "3 days", or "Done" when the problem graduates. */
export function formatInterval(days: number | null | undefined): string {
  if (days === null) return 'Done';
  if (days === undefined) return '—';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

interface Props {
  visible: boolean;
  title?: string;
  /** From GET /revisions/due (nextIntervals). */
  intervals?: NextIntervals;
  onSelect: (rating: Rating) => void;
  onCancel: () => void;
}

/** Centred picker showing all four ratings and the interval each schedules. */
export default function RatingModal({ visible, title, intervals, onSelect, onCancel }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        {/* Inner Pressable swallows taps so they don't close the modal */}
        <Pressable style={styles.content} onPress={() => {}}>
          <Text style={styles.title}>How did it go?</Text>
          {title ? <Text style={styles.subtitle} numberOfLines={2}>{title}</Text> : null}

          <View style={styles.grid}>
            {OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.rating}
                style={[styles.option, { borderColor: o.color }]}
                onPress={() => onSelect(o.rating)}
                accessibilityRole="button"
                accessibilityLabel={`${o.label}, next review ${formatInterval(intervals?.[o.rating])}`}
              >
                <Text style={[styles.optionLabel, { color: o.color }]}>{o.label}</Text>
                <Text style={styles.optionInterval}>
                  {intervals?.[o.rating] === null ? 'Graduates' : `Next: ${formatInterval(intervals?.[o.rating])}`}
                </Text>
                <Text style={styles.optionHint}>{o.hint}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(73, 71, 64, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  content: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 420,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontStyle: 'italic',
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
  },
  option: {
    width: '48%',
    backgroundColor: theme.colors.surfaceSecondary,
    borderWidth: 1,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  optionLabel: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  optionInterval: {
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontSize: 11,
    marginTop: 4,
  },
  optionHint: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: 10,
    marginTop: 2,
  },
  cancelButton: {
    marginTop: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
  },
  cancelText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontWeight: theme.typography.fontWeights.bold,
    fontSize: theme.typography.fontSizes.xs,
    textTransform: 'uppercase',
  },
});
