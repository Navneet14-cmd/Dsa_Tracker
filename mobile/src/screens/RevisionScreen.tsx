import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl,
  Alert 
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { theme } from '../config/theme';

export default function RevisionScreen() {
  const [dueRevisions, setDueRevisions] = useState<any[]>([]);
  const [upcoming, setUpcoming] = useState<{
    tomorrow: any[];
    in3Days: any[];
    in7Days: any[];
  }>({
    tomorrow: [],
    in3Days: [],
    in7Days: [],
  });

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompletingId, setIsCompletingId] = useState<string | null>(null);

  const fetchRevisions = async (showLoadingIndicator = false) => {
    try {
      if (showLoadingIndicator) setIsInitialLoading(true);
      
      const [dueResponse, upcomingResponse] = await Promise.all([
        api.get('/revisions/due'),
        api.get('/revisions/upcoming'),
      ]);

      setDueRevisions(dueResponse.data.revisions || []);
      setUpcoming(upcomingResponse.data.data || { tomorrow: [], in3Days: [], in7Days: [] });
    } catch (error) {
      console.error('[Fetch Revisions Error]:', error);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  // Re-fetch revisions when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchRevisions(isInitialLoading);
    }, [])
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchRevisions(false);
  };

  const handleCompleteRevision = async (id: string) => {
    setIsCompletingId(id);
    try {
      await api.post(`/revisions/${id}/complete`);
      // Silent refresh to update lists (no blocking alert for smooth UX)
      await fetchRevisions(false);
    } catch (error: any) {
      console.error('[Complete Revision Error]:', error);
      const apiMsg = error.response?.data?.message || 'Failed to complete revision.';
      Alert.alert('Error', apiMsg);
    } finally {
      setIsCompletingId(null);
    }
  };

  const renderDifficultyBadge = (difficulty: string) => {
    const diffColor = {
      EASY: theme.colors.success,
      MEDIUM: theme.colors.warning,
      HARD: theme.colors.danger,
    }[difficulty as 'EASY' | 'MEDIUM' | 'HARD'] || theme.colors.text;

    return (
      <Text style={[styles.difficultyText, { color: diffColor }]}>
        [{difficulty}]
      </Text>
    );
  };

  const renderUpcomingList = (items: any[]) => {
    if (items.length === 0) {
      return (
        <View style={styles.emptyTimelineContainer}>
          <Text style={styles.emptyTimelineText}>No reviews scheduled</Text>
        </View>
      );
    }

    return items.map((item) => {
      const scheduledDate = new Date(item.scheduledFor).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });

      return (
        <View key={item.id} style={styles.upcomingCard}>
          <View style={styles.upcomingInfo}>
            <Text style={styles.upcomingTitle}>
              #{item.problem.leetcodeNumber} - {item.problem.title}
            </Text>
            <View style={styles.upcomingMetadata}>
              {renderDifficultyBadge(item.problem.difficulty)}
              <Text style={styles.upcomingIntervalText}>
                INTERVAL: {item.intervalDays}D
              </Text>
            </View>
          </View>
          <View style={styles.upcomingDateContainer}>
            <Text style={styles.upcomingDateLabel}>Due</Text>
            <Text style={styles.upcomingDateText}>{scheduledDate}</Text>
          </View>
        </View>
      );
    });
  };

  if (isInitialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Due Reviews Header */}
        <Text style={styles.sectionTitle}>Due for Review</Text>

        {dueRevisions.length === 0 ? (
          <View style={styles.caughtUpCard}>
            <Text style={styles.caughtUpTitle}>🎉 All caught up!</Text>
            <Text style={styles.caughtUpSubtitle}>
              No LeetCode problems due for spaced repetition today.
            </Text>
          </View>
        ) : (
          dueRevisions.map((item) => {
            const isCompleting = isCompletingId === item.id;
            const isAnyCompleting = isCompletingId !== null;
            const scheduledDate = new Date(item.scheduledFor).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            return (
              <View key={item.id} style={styles.dueCard}>
                <View style={styles.dueHeader}>
                  <Text style={styles.dueProblemTitle}>
                    #{item.problem.leetcodeNumber} - {item.problem.title}
                  </Text>
                  {renderDifficultyBadge(item.problem.difficulty)}
                </View>

                <View style={styles.dueDetails}>
                  <Text style={styles.detailLabel}>
                    SCHEDULED: <Text style={styles.detailValue}>{scheduledDate}</Text>
                  </Text>
                  <Text style={styles.detailLabel}>
                    INTERVAL: <Text style={styles.detailValue}>{item.intervalDays} DAYS</Text>
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.completeButton,
                    (isCompleting || isAnyCompleting) && styles.disabledCompleteButton
                  ]}
                  onPress={() => handleCompleteRevision(item.id)}
                  disabled={isCompleting || isAnyCompleting}
                >
                  {isCompleting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.completeButtonText}>Complete Review  →</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}

        {/* Upcoming Review Timeline */}
        <Text style={styles.sectionTitle}>Upcoming Schedule</Text>
        
        <Text style={styles.timelineHeader}>Tomorrow</Text>
        {renderUpcomingList(upcoming.tomorrow)}

        <Text style={styles.timelineHeader}>In 3 Days</Text>
        {renderUpcomingList(upcoming.in3Days)}

        <Text style={styles.timelineHeader}>In 7 Days / Later</Text>
        {renderUpcomingList(upcoming.in7Days)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  scrollContainer: {
    padding: theme.spacing.lg,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  caughtUpCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  caughtUpTitle: {
    color: theme.colors.success,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    marginBottom: theme.spacing.xs,
  },
  caughtUpSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    textAlign: 'center',
  },
  dueCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  dueProblemTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  difficultyText: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  dueDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceSecondary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  detailLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
  },
  detailValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontWeight: theme.typography.fontWeights.semibold,
  },
  completeButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  disabledCompleteButton: {
    backgroundColor: theme.colors.border,
    opacity: 0.6,
  },
  completeButtonText: {
    color: '#ffffff',
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  timelineHeader: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.display,
    fontStyle: 'italic',
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
    borderStyle: 'dashed',
    paddingBottom: 4,
  },
  emptyTimelineContainer: {
    backgroundColor: 'transparent',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    marginBottom: theme.spacing.md,
  },
  emptyTimelineText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontStyle: 'italic',
  },
  upcomingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  upcomingInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  upcomingTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    marginBottom: 6,
  },
  upcomingMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upcomingIntervalText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    marginLeft: theme.spacing.md,
    fontWeight: theme.typography.fontWeights.medium,
  },
  upcomingDateContainer: {
    alignItems: 'flex-end',
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    paddingLeft: theme.spacing.md,
  },
  upcomingDateLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: 9,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  upcomingDateText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
  },
});
