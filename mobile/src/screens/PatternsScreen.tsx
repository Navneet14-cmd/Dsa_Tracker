import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator, 
  RefreshControl 
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { theme } from '../config/theme';

const BASKLINE_MASTERY_TARGET = 5;

export default function PatternsScreen() {
  const [groupedPatterns, setGroupedPatterns] = useState<{ [topicName: string]: any[] }>({});
  const [sortedTopicNames, setSortedTopicNames] = useState<string[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchPatternsDashboard = async (showLoadingIndicator = false) => {
    try {
      if (showLoadingIndicator) setIsInitialLoading(true);
      const response = await api.get('/dashboard/patterns');
      const rawPatterns = response.data.data.patterns || [];

      // Group patterns by topic
      const grouped: { [topicName: string]: any[] } = {};
      rawPatterns.forEach((p: any) => {
        if (p.topics && p.topics.length > 0) {
          p.topics.forEach((t: any) => {
            const name = t.topicName;
            if (!grouped[name]) grouped[name] = [];
            // Duplicate pattern card under each topic it belongs to (deliberate design)
            grouped[name].push(p);
          });
        } else {
          const uncategorized = 'General Patterns';
          if (!grouped[uncategorized]) grouped[uncategorized] = [];
          grouped[uncategorized].push(p);
        }
      });

      // Sort patterns alphabetically within each topic group
      Object.keys(grouped).forEach((topicName) => {
        grouped[topicName].sort((a, b) => a.patternName.localeCompare(b.patternName));
      });

      // Sort topic names alphabetically
      const sortedTopics = Object.keys(grouped).sort();

      setGroupedPatterns(grouped);
      setSortedTopicNames(sortedTopics);
    } catch (error) {
      console.error('[Fetch Patterns Dashboard Error]:', error);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchPatternsDashboard(isInitialLoading);
    }, [])
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchPatternsDashboard(false);
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
        <View style={styles.headerInfo}>
          <Text style={styles.dashboardTitle}>Patterns Coverage</Text>
          <Text style={styles.dashboardSubtitle}>
            Reinforce key techniques. Mastery benchmark is set to {BASKLINE_MASTERY_TARGET} solved problems per pattern.
          </Text>
        </View>

        {sortedTopicNames.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No patterns data found.</Text>
          </View>
        ) : (
          sortedTopicNames.map((topicName) => (
            <View key={topicName} style={styles.topicSection}>
              <View style={styles.topicLedgerHeader}>
                <Text style={styles.topicSectionHeader}>{topicName}</Text>
                <Text style={styles.ledgerSubtitle}>PROFICIENCY_TALLY</Text>
              </View>

              <View style={styles.topicTableCard}>
                {groupedPatterns[topicName].map((pattern, index) => {
                  const solved = pattern.solvedCount || 0;
                  const isLast = index === groupedPatterns[topicName].length - 1;

                  const renderPatternTally = (solvedCount: number) => {
                    const boxes = [];
                    for (let i = 0; i < BASKLINE_MASTERY_TARGET; i++) {
                      boxes.push(
                        <View 
                          key={i} 
                          style={[
                            styles.tallyBox,
                            i < solvedCount ? styles.tallyBoxFilled : null
                          ]} 
                        />
                      );
                    }
                    return <View style={styles.tallyContainer}>{boxes}</View>;
                  };

                  return (
                    <View 
                      key={`${topicName}-${pattern.patternId}`} 
                      style={[styles.topicTableRow, isLast && styles.topicTableRowLast]}
                    >
                      <View style={styles.topicRowTop}>
                        <Text style={styles.topicName}>{pattern.patternName}</Text>
                        <Text style={styles.ratioText}>
                          {solved} / {BASKLINE_MASTERY_TARGET}
                        </Text>
                      </View>

                      <View style={styles.tallyBoxesWrapper}>
                        {renderPatternTally(solved)}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
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
  headerInfo: {
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dashboardTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontStyle: 'italic',
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
  },
  dashboardSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    lineHeight: 18,
    marginTop: theme.spacing.xs,
  },
  emptyContainer: {
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.sm,
  },
  topicSection: {
    marginBottom: theme.spacing.xl,
  },
  topicLedgerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: 8,
    marginBottom: 16,
    marginTop: 24,
  },
  topicSectionHeader: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.sans,
    fontSize: 20,
    fontWeight: '600',
  },
  ledgerSubtitle: {
    fontFamily: theme.fonts.mono,
    fontSize: 12,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  topicTableCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c9c2ae',
    marginBottom: 48,
  },
  topicTableRow: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#cbc6bd',
    borderStyle: 'dashed',
  },
  topicTableRowLast: {
    borderBottomWidth: 0,
  },
  topicRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  topicName: {
    fontFamily: theme.fonts.sans,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  ratioText: {
    fontFamily: theme.fonts.mono,
    fontSize: 15,
    color: theme.colors.text,
  },
  tallyBoxesWrapper: {
    marginTop: 4,
  },
  tallyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tallyBox: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: '#7a776f',
    marginRight: 2,
  },
  tallyBoxFilled: {
    backgroundColor: '#2d5a27',
    borderColor: '#2d5a27',
  },
});
