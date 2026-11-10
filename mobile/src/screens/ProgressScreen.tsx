import React, { useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl,
  Modal,
  TextInput,
  Alert
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { theme } from '../config/theme';

export default function ProgressScreen() {
  const [topics, setTopics] = useState<any[]>([]);
  const [difficultyStats, setDifficultyStats] = useState({
    easy: 0,
    medium: 0,
    hard: 0,
    total: 0,
  });

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Goal Modal states
  const [isGoalModalVisible, setIsGoalModalVisible] = useState(false);
  const [selectedTopicForGoal, setSelectedTopicForGoal] = useState<any>(null);
  const [goalInput, setGoalInput] = useState('');
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchDashboard = async (showLoadingIndicator = false) => {
    try {
      if (showLoadingIndicator) setIsInitialLoading(true);
      const response = await api.get('/dashboard/progress');
      const { topics: topicsData, difficultyStats: diffData } = response.data.data;
      
      setTopics(topicsData || []);
      setDifficultyStats(diffData || { easy: 0, medium: 0, hard: 0, total: 0 });
    } catch (error) {
      console.error('[Fetch Dashboard Progress Error]:', error);
    } finally {
      setIsInitialLoading(false);
      setIsRefreshing(false);
    }
  };

  // Re-fetch progress metrics when user navigates to the tab
  useFocusEffect(
    useCallback(() => {
      fetchDashboard(isInitialLoading);
    }, [])
  );

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDashboard(false);
  };

  const openGoalModal = (topic: any) => {
    setSelectedTopicForGoal({
      id: topic.topicId,
      name: topic.topicName,
      targetCount: topic.targetCount,
    });
    // Pre-fill goal count if it already exists
    setGoalInput(topic.targetCount !== null ? topic.targetCount.toString() : '');
    setModalError(null);
    setIsGoalModalVisible(true);
  };

  const handleSaveGoal = async () => {
    const targetCount = parseInt(goalInput, 10);
    
    if (isNaN(targetCount) || targetCount <= 0) {
      setModalError('Goal must be a valid positive number.');
      return;
    }

    setIsSavingGoal(true);
    setModalError(null);

    try {
      await api.post('/goals', {
        topicId: selectedTopicForGoal.id,
        targetCount,
      });

      setIsGoalModalVisible(false);
      setIsSavingGoal(false);
      // Re-fetch to update progress bars
      fetchDashboard(false);
      Alert.alert('Success', `Goal updated for ${selectedTopicForGoal.name}!`);
    } catch (error: any) {
      console.error('[Save Goal Error]:', error);
      setIsSavingGoal(false);
      const apiMsg = error.response?.data?.message || 'Failed to update target goal count.';
      setModalError(apiMsg);
    }
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
        {/* Dashboard Header */}
        <View style={styles.dashboardHeader}>
          <Text style={styles.headerTitle}>Performance Summary</Text>
        </View>

        {/* Index Card Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Total Card */}
          <View style={[styles.statCard, { borderTopColor: theme.colors.primary }]}>
            <Text style={styles.statLabel}>TOTAL_SOLVED</Text>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {difficultyStats.total}
            </Text>
          </View>
          {/* Easy Card */}
          <View style={[styles.statCard, { borderTopColor: '#2d5a27' }]}>
            <Text style={styles.statLabel}>EASY_SOLVED</Text>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {difficultyStats.easy}
            </Text>
          </View>
          {/* Medium Card */}
          <View style={[styles.statCard, { borderTopColor: '#d97706' }]}>
            <Text style={styles.statLabel}>MEDIUM_SOLVED</Text>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {difficultyStats.medium}
            </Text>
          </View>
          {/* Hard Card */}
          <View style={[styles.statCard, { borderTopColor: '#991b1b' }]}>
            <Text style={styles.statLabel}>HARD_SOLVED</Text>
            <Text style={[styles.statValue, { color: theme.colors.primary }]}>
              {difficultyStats.hard}
            </Text>
          </View>
        </View>

        {/* Topic Mastery Section */}
        <View style={styles.topicLedgerHeader}>
          <Text style={styles.headerTitle}>Topic Ledger</Text>
          <Text style={styles.ledgerSubtitle}>PROGRESS_TALLY</Text>
        </View>

        <View style={styles.topicTableCard}>
          {topics.map((item, index) => {
            const hasGoal = item.targetCount !== null;
            const solvedCount = item.solvedCount || 0;
            const targetCount = item.targetCount || 0;
            const isLast = index === topics.length - 1;

            const renderTallyBoxes = (solved: number, target: number) => {
              const boxes = [];
              for (let i = 0; i < target; i++) {
                boxes.push(
                  <View 
                    key={i} 
                    style={[
                      styles.tallyBox,
                      i < solved ? styles.tallyBoxFilled : null
                    ]} 
                  />
                );
              }
              return <View style={styles.tallyContainer}>{boxes}</View>;
            };

            return (
              <View key={item.topicId} style={[styles.topicTableRow, isLast && styles.topicTableRowLast]}>
                <View style={styles.topicRowTop}>
                  <Text style={styles.topicName}>{item.topicName}</Text>
                  {hasGoal ? (
                    <TouchableOpacity onPress={() => openGoalModal(item)}>
                      <Text style={styles.ratioText}>{solvedCount} / {targetCount}</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={() => openGoalModal(item)}>
                      <Text style={styles.ratioText}>{solvedCount} / --</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {hasGoal ? (
                  <View style={styles.tallyBoxesWrapper}>
                    {renderTallyBoxes(solvedCount, targetCount)}
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.setGoalTextBtn} 
                    onPress={() => openGoalModal(item)}
                  >
                    <Text style={styles.setGoalTextBtnLabel}>+ SET TARGET</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Set Goal Modal Overlay */}
      <Modal
        visible={isGoalModalVisible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Target Goal</Text>
            {selectedTopicForGoal && (
              <Text style={styles.modalSubtitle}>
                Configure target problem count for '{selectedTopicForGoal.name}'
              </Text>
            )}

            {modalError && (
              <View style={styles.modalErrorContainer}>
                <Text style={styles.modalErrorText}>{modalError}</Text>
              </View>
            )}

            <Text style={styles.modalLabel}>Target Count</Text>
            <TextInput
              style={[styles.modalInput, isSavingGoal && styles.disabledInput]}
              keyboardType="number-pad"
              placeholder="e.g. 20"
              placeholderTextColor={theme.colors.border}
              value={goalInput}
              onChangeText={setGoalInput}
              editable={!isSavingGoal}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={() => setIsGoalModalVisible(false)}
                disabled={isSavingGoal}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[
                  styles.modalButton, 
                  styles.saveButton, 
                  (isSavingGoal || !goalInput.trim()) && styles.disabledSaveButton
                ]} 
                onPress={handleSaveGoal}
                disabled={isSavingGoal || !goalInput.trim()}
              >
                {isSavingGoal ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Goal</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  dashboardHeader: {
    marginBottom: theme.spacing.xl,
  },
  headerTitle: {
    fontFamily: theme.fonts.sans,
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.primary,
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
  ledgerSubtitle: {
    fontFamily: theme.fonts.mono,
    fontSize: 12,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.lg,
  },
  statCard: {
    backgroundColor: '#ffffff',
    width: '48%',
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#c9c2ae',
    borderTopWidth: 4,
    marginBottom: theme.spacing.md,
    height: 100,
    justifyContent: 'space-between',
  },
  statValue: {
    fontFamily: theme.fonts.mono,
    fontSize: 32,
    fontWeight: '500',
  },
  statLabel: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
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
  setGoalTextBtn: {
    marginTop: 4,
  },
  setGoalTextBtnLabel: {
    fontFamily: theme.fonts.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  setGoalButton: {
    borderColor: theme.colors.textSecondary,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  setGoalButtonText: {
    color: theme.colors.primaryLight,
    fontFamily: theme.fonts.sans,
    fontWeight: theme.typography.fontWeights.semibold,
    fontSize: theme.typography.fontSizes.xs,
  },

  // Modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(73, 71, 64, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.xl,
    width: '100%',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  modalTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontStyle: 'italic',
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  modalErrorContainer: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.danger,
    backgroundColor: 'rgba(142, 33, 23, 0.05)',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.md,
  },
  modalErrorText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
  },
  modalLabel: {
    fontFamily: theme.fonts.sans,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  modalInput: {
    backgroundColor: 'transparent',
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
    fontSize: theme.typography.fontSizes.sm,
  },
  disabledInput: {
    opacity: 0.6,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.md,
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontWeight: theme.typography.fontWeights.bold,
    fontSize: theme.typography.fontSizes.xs,
    textTransform: 'uppercase',
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
  },
  disabledSaveButton: {
    backgroundColor: theme.colors.border,
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontFamily: theme.fonts.mono,
    fontWeight: theme.typography.fontWeights.bold,
    fontSize: theme.typography.fontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
