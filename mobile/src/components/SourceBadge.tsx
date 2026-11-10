import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { theme } from '../config/theme';
import { AI_SOURCE_LABELS, AiSource } from '../services/api';

/**
 * Small label naming the provider behind an AI answer: "Smart rules",
 * "Local AI" or "Claude". Notes when the configured provider was
 * unavailable and the built-in rules answered instead.
 */
export default function SourceBadge({ source, fallbackFrom }: { source?: AiSource; fallbackFrom?: AiSource }) {
  if (!source) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.badge}>{AI_SOURCE_LABELS[source] ?? source}</Text>
      {fallbackFrom ? (
        <Text style={styles.note}>{AI_SOURCE_LABELS[fallbackFrom] ?? fallbackFrom} unavailable</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginVertical: theme.spacing.xs,
  },
  badge: {
    color: theme.colors.primaryLight,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  note: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: 10,
    fontStyle: 'italic',
    marginLeft: theme.spacing.sm,
  },
});
