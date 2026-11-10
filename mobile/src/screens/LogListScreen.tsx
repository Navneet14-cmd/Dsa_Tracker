import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator,
  ScrollView,
  RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { theme } from '../config/theme';

export default function LogListScreen({ navigation }: any) {
  const [problems, setProblems] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string | null>(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Cached taxonomies from Zustand (split selectors for reference stability)
  const topics = useAuthStore((state) => state.topics);
  const patterns = useAuthStore((state) => state.patterns);

  const isFirstFocus = useRef(true);

  const fetchProblems = async (pageIndex: number, shouldReset = false) => {
    try {
      if (shouldReset) {
        if (pageIndex === 1 && !isRefreshing) setIsInitialLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const params: any = {
        page: pageIndex,
        limit: 10,
      };

      if (selectedTopicId) params.topicId = selectedTopicId;
      if (selectedPatternId) params.patternId = selectedPatternId;
      if (selectedDifficulty) params.difficulty = selectedDifficulty;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const response = await api.get('/problems', { params });
      const fetchedProblems = response.data.problems || [];

      if (shouldReset) {
        setProblems(fetchedProblems);
      } else {
        setProblems((prev) => [...prev, ...fetchedProblems]);
      }

      setHasMore(fetchedProblems.length === 10);
    } catch (error) {
      console.error('[Fetch Problems Error]:', error);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  // Re-fetch when screen gains focus (skip first mount to prevent duplicate fetch)
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      setPage(1);
      setHasMore(true);
      fetchProblems(1, true);
    }, [])
  );

  // Immediate fetch when filters change
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchProblems(1, true);
  }, [selectedTopicId, selectedPatternId, selectedDifficulty]);

  // Debounced search trigger
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      setHasMore(true);
      fetchProblems(1, true);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setPage(1);
    setHasMore(true);
    fetchProblems(1, true);
  };

  const handleLoadMore = () => {
    if (isLoadingMore || !hasMore || isRefreshing) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchProblems(nextPage, false);
  };

  const renderProblemItem = ({ item }: { item: any }) => {
    const date = new Date(item.dateSolved).toLocaleDateString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const diffColor = {
      EASY: theme.colors.success,
      MEDIUM: theme.colors.warning,
      HARD: theme.colors.danger,
    }[item.difficulty as 'EASY' | 'MEDIUM' | 'HARD'] || theme.colors.text;

    return (
      <TouchableOpacity 
        style={styles.card} 
        onPress={() => navigation.navigate('LogForm', { problem: item })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.leetcodeNumber}>ENTRY_REF: #{String(item.leetcodeNumber).padStart(3, '0')}</Text>
          {item.confidence && (
            <Text style={styles.confidenceText}>CONFIDENCE: {item.confidence}/5</Text>
          )}
        </View>
        
        <View style={styles.titleContainer}>
          <Text style={styles.problemTitle}>{item.title}</Text>
          <View style={[styles.difficultyUnderline, { backgroundColor: diffColor }]} />
        </View>
        
        <View style={styles.chipRow}>
          {item.topics?.map(({ topic }: any) => (
            <View key={topic.id} style={styles.tagChip}>
              <Text style={styles.tagText}>{topic.name}</Text>
            </View>
          ))}
          {item.patterns?.map(({ pattern }: any) => (
            <View key={pattern.id} style={[styles.tagChip, styles.patternTagChip]}>
              <Text style={styles.tagText}>{pattern.name}</Text>
            </View>
          ))}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.footerLabel}>RECORDED: <Text style={styles.footerValue}>{date}</Text></Text>
          <Text style={styles.statusText}>{item.difficulty}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSessionTally = () => {
    const today = new Date();
    const solvedCount = problems.filter((p) => {
      if (!p.dateSolved) return false;
      const d = new Date(p.dateSolved);
      return d.getDate() === today.getDate() &&
             d.getMonth() === today.getMonth() &&
             d.getFullYear() === today.getFullYear();
    }).length;

    const target = 10;
    const progressPercent = Math.min(100, Math.round((solvedCount / target) * 100));

    const renderGroup = (startIndex: number) => {
      const boxes = [];
      for (let i = 0; i < 5; i++) {
        const globalIndex = startIndex + i;
        const isSolved = solvedCount > globalIndex;
        const isFifth = i === 4;

        if (isFifth) {
          boxes.push(
            <View 
              key={i} 
              style={[
                styles.tallyBox, 
                isSolved ? styles.tallyBoxSlashActive : styles.tallyBoxSlashInactive
              ]}
            >
              {isSolved && <View style={styles.tallySlashLine} />}
              <Text style={[styles.tallyText, { color: isSolved ? '#ffffff' : theme.colors.border }]}>/</Text>
            </View>
          );
        } else {
          boxes.push(
            <View 
              key={i} 
              style={[
                styles.tallyBox, 
                isSolved ? styles.tallyBoxActive : styles.tallyBoxInactive
              ]}
            >
              <Text style={[styles.tallyText, { color: isSolved ? theme.colors.text : theme.colors.border }]}>
                {isSolved ? '/' : ''}
              </Text>
            </View>
          );
        }
      }
      return <View style={styles.tallyGroup}>{boxes}</View>;
    };

    return (
      <View style={styles.sessionTallyCard}>
        <Text style={styles.sessionTallyTitle}>Session Tally</Text>
        <View style={styles.sessionTallyRow}>
          <View style={styles.tallyGroupsRow}>
            {renderGroup(0)}
            {renderGroup(5)}
          </View>
          <View style={styles.tallyMetrics}>
            <Text style={styles.tallyTargetText}>PRACTICE_TARGET: {solvedCount}/{target}/DAY</Text>
            <Text style={styles.tallyProgressText}>TOTAL_PROGRESS: {progressPercent}%</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderFooter = () => {
    return (
      <View style={styles.footerContainer}>
        {renderSessionTally()}
        {isLoadingMore && (
          <View style={styles.footerLoading}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="FIND_ENTRY_BY_NAME_OR_ID"
          placeholderTextColor={theme.colors.border}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
        />
      </View>

      {/* Filter Options */}
      <View style={styles.filtersContainer}>
        {/* Difficulty Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollView}>
          <TouchableOpacity 
            style={[styles.filterChip, !selectedDifficulty && styles.activeFilterChip]}
            onPress={() => setSelectedDifficulty(null)}
          >
            <Text style={[styles.filterChipText, !selectedDifficulty && styles.activeFilterChipText]}>All Diff</Text>
          </TouchableOpacity>
          {['EASY', 'MEDIUM', 'HARD'].map((diff) => (
            <TouchableOpacity
              key={diff}
              style={[styles.filterChip, selectedDifficulty === diff && styles.activeFilterChip]}
              onPress={() => setSelectedDifficulty(diff)}
            >
              <Text style={[styles.filterChipText, selectedDifficulty === diff && styles.activeFilterChipText]}>{diff}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Topics Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollView}>
          <TouchableOpacity 
            style={[styles.filterChip, !selectedTopicId && styles.activeFilterChip]}
            onPress={() => setSelectedTopicId(null)}
          >
            <Text style={[styles.filterChipText, !selectedTopicId && styles.activeFilterChipText]}>All Topics</Text>
          </TouchableOpacity>
          {topics.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.filterChip, selectedTopicId === t.id && styles.activeFilterChip]}
              onPress={() => setSelectedTopicId(t.id)}
            >
              <Text style={[styles.filterChipText, selectedTopicId === t.id && styles.activeFilterChipText]}>{t.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Patterns Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScrollView}>
          <TouchableOpacity 
            style={[styles.filterChip, !selectedPatternId && styles.activeFilterChip]}
            onPress={() => setSelectedPatternId(null)}
          >
            <Text style={[styles.filterChipText, !selectedPatternId && styles.activeFilterChipText]}>All Patterns</Text>
          </TouchableOpacity>
          {patterns.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.filterChip, selectedPatternId === p.id && styles.activeFilterChip]}
              onPress={() => setSelectedPatternId(p.id)}
            >
              <Text style={[styles.filterChipText, selectedPatternId === p.id && styles.activeFilterChipText]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Problems List */}
      {isInitialLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={problems}
          keyExtractor={(item) => item.id}
          renderItem={renderProblemItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl 
              refreshing={isRefreshing} 
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No matching problem logs found.</Text>
            </View>
          }
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => navigation.navigate('LogForm')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchContainer: {
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  searchInput: {
    backgroundColor: 'transparent',
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    fontSize: theme.typography.fontSizes.sm,
  },
  filtersContainer: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterScrollView: {
    paddingHorizontal: theme.spacing.lg,
    marginVertical: 4,
  },
  filterChip: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    height: 32,
  },
  activeFilterChip: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semibold,
  },
  activeFilterChipText: {
    color: '#ffffff',
  },
  listContainer: {
    padding: theme.spacing.lg,
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  leetcodeNumber: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs - 2,
    fontWeight: theme.typography.fontWeights.bold,
  },
  confidenceText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs - 2,
  },
  titleContainer: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  problemTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    paddingBottom: 2,
  },
  difficultyUnderline: {
    height: 3,
    width: '100%',
    borderRadius: 1.5,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.md,
  },
  tagChip: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: theme.colors.textSecondary,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginRight: 6,
    marginBottom: 6,
  },
  patternTagChip: {
    borderColor: theme.colors.primaryLight,
  },
  tagText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.medium,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
    borderStyle: 'dashed',
    paddingTop: theme.spacing.md,
    alignItems: 'center',
  },
  footerLabel: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
  },
  footerValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontWeight: theme.typography.fontWeights.semibold,
  },
  statusText: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  footerLoading: {
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
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
  fab: {
    position: 'absolute',
    bottom: theme.spacing.xl,
    right: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: theme.typography.fontWeights.semibold,
    lineHeight: 32,
  },
  footerContainer: {
    marginTop: theme.spacing.lg,
  },
  sessionTallyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  sessionTallyTitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
    borderStyle: 'dashed',
    paddingBottom: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  sessionTallyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  tallyGroupsRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  tallyGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  tallyBox: {
    width: 24,
    height: 32,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tallyBoxActive: {
    borderColor: theme.colors.primary,
  },
  tallyBoxInactive: {
    borderColor: theme.colors.border,
    opacity: 0.3,
  },
  tallyBoxSlashActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    borderWidth: 2,
    position: 'relative',
  },
  tallyBoxSlashInactive: {
    borderColor: theme.colors.border,
    opacity: 0.3,
  },
  tallySlashLine: {
    position: 'absolute',
    top: '45%',
    left: -4,
    right: -4,
    height: 2,
    backgroundColor: '#ffffff',
    transform: [{ rotate: '45deg' }],
  },
  tallyText: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
  },
  tallyMetrics: {
    alignItems: 'flex-end',
  },
  tallyTargetText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
  },
  tallyProgressText: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    marginTop: 2,
  },
});
