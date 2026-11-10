import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Switch, 
  ActivityIndicator, 
  Alert,
  Modal
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api, AI_REQUEST_TIMEOUT_MS } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { theme } from '../config/theme';
import SourceBadge from '../components/SourceBadge';
import ProblemHistory from '../components/ProblemHistory';

const formatDays = (d: number) => `${d} ${d === 1 ? 'day' : 'days'}`;

export default function LogFormScreen({ route, navigation }: any) {
  const problem = route.params?.problem;
  const isEditMode = !!problem;

  // Cached taxonomies from store (split selectors for reference stability)
  const topics = useAuthStore((state) => state.topics);
  const patterns = useAuthStore((state) => state.patterns);

  // Form fields states
  const [leetcodeNumber, setLeetcodeNumber] = useState('');
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('EASY');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [selectedPatternIds, setSelectedPatternIds] = useState<string[]>([]);
  const [timeTakenMins, setTimeTakenMins] = useState('');
  const [dateSolved, setDateSolved] = useState(new Date());
  const [solvedAlone, setSolvedAlone] = useState(true);
  const [notes, setNotes] = useState('');
  const [needsRevision, setNeedsRevision] = useState(false);
  const [confidence, setConfidence] = useState<number>(3);

  // Status states
  const [isLoading, setIsLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // AI Modal States
  const [isAIModalVisible, setIsAIModalVisible] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiData, setAiData] = useState<any>(null);

  // Pre-populate fields in Edit Mode
  useEffect(() => {
    if (isEditMode && problem) {
      setLeetcodeNumber(problem.leetcodeNumber.toString());
      setTitle(problem.title);
      setDifficulty(problem.difficulty);
      
      // Map relation objects to flat array IDs
      const tIds = problem.topics?.map((t: any) => t.topic.id) || [];
      const pIds = problem.patterns?.map((p: any) => p.pattern.id) || [];
      setSelectedTopicIds(tIds);
      setSelectedPatternIds(pIds);
      
      setTimeTakenMins(problem.timeTakenMins.toString());
      setDateSolved(new Date(problem.dateSolved));
      setSolvedAlone(problem.solvedAlone);
      setNotes(problem.notes || '');
      setNeedsRevision(problem.needsRevision);
      setConfidence(problem.confidence);
    }
  }, [isEditMode, problem]);

  // Toggle selection chips
  const toggleTopic = (id: string) => {
    setSelectedTopicIds((prev) => 
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const togglePattern = (id: string) => {
    setSelectedPatternIds((prev) => 
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDateSolved(selectedDate);
    }
  };

  // Submit Handler
  const handleSubmit = async () => {
    const num = parseInt(leetcodeNumber, 10);
    const mins = parseInt(timeTakenMins, 10);

    if (isNaN(num) || num <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid LeetCode problem number.');
      return;
    }

    if (!title.trim()) {
      Alert.alert('Validation Error', 'Please enter a problem title.');
      return;
    }

    if (isNaN(mins) || mins < 0) {
      Alert.alert('Validation Error', 'Please enter valid minutes taken.');
      return;
    }

    setIsLoading(true);

    const payload = {
      leetcodeNumber: num,
      title: title.trim(),
      difficulty,
      topicIds: selectedTopicIds,
      patternIds: selectedPatternIds,
      timeTakenMins: mins,
      dateSolved: dateSolved.toISOString(),
      solvedAlone,
      notes: notes.trim() || null,
      needsRevision,
      confidence,
    };

    try {
      if (isEditMode) {
        // Edit Mode: PATCH /problems/:id
        await api.patch(`/problems/${problem.id}`, payload);
        setIsLoading(false);
        Alert.alert('Success', 'Problem log updated successfully.', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        // Create Mode: POST /problems
        const createResponse = await api.post('/problems', payload);
        const createdId = createResponse.data.problem.id;

        // Immediately trigger AI recommendations modal loading state
        setIsAILoading(true);
        setIsAIModalVisible(true);
        setIsLoading(false);

        try {
          const aiResponse = await api.post(
            '/ai/recommend',
            { problemId: createdId },
            { timeout: AI_REQUEST_TIMEOUT_MS }
          );
          setAiData(aiResponse.data);
          setIsAILoading(false);
        } catch (aiError) {
          console.error('[AI Recommendation Load Failure]:', aiError);
          setIsAIModalVisible(false);
          setIsAILoading(false);
          // Decoupled: inform user but return to list anyway since problem is saved
          Alert.alert(
            'Problem Saved',
            'Your problem has been logged successfully, but AI recommendations are currently unavailable. Please try again later.',
            [{ text: 'Got it', onPress: () => navigation.goBack() }]
          );
        }
      }
    } catch (error: any) {
      setIsLoading(false);
      const body = error.response?.data;
      if (!isEditMode && error.response?.status === 409 && body?.code === 'DUPLICATE_PROBLEM' && body.existingProblemId) {
        promptDuplicate(body.existingProblemId, body.message, payload);
        return;
      }
      console.error('[Form Submit Failure]:', error);
      const apiMsg = error.response?.data?.message || 'An unexpected network error occurred.';
      Alert.alert('Error', apiMsg);
    }
  };

  // Already logged: offer to record this solve as a re-attempt, or open the entry.
  const promptDuplicate = (existingId: string, message: string, payload: any) => {
    Alert.alert(
      'Already logged',
      message || `You've already logged #${payload.leetcodeNumber}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open existing', onPress: () => openExisting(existingId) },
        { text: 'Log re-attempt', onPress: () => logReattempt(existingId, payload) },
      ],
      { cancelable: true }
    );
  };

  const openExisting = async (existingId: string) => {
    setIsLoading(true);
    try {
      const res = await api.get(`/problems/${existingId}`);
      setIsLoading(false);
      navigation.replace('LogForm', { problem: res.data.problem });
    } catch (err: any) {
      setIsLoading(false);
      Alert.alert('Error', err.response?.data?.message || 'Could not open the existing entry.');
    }
  };

  const logReattempt = async (existingId: string, payload: any) => {
    setIsLoading(true);
    try {
      const res = await api.post(`/problems/${existingId}/attempts`, {
        attemptedAt: payload.dateSolved,
        timeTakenMins: payload.timeTakenMins,
        solvedAlone: payload.solvedAlone,
        confidence: payload.confidence,
        notes: payload.notes,
      });
      setIsLoading(false);
      const { completedRevision, nextRevision } = res.data;
      const detail = completedRevision
        ? nextRevision
          ? `Your due review was completed too. Next review in ${formatDays(nextRevision.intervalDays)}.`
          : 'Your due review was completed too, and this problem has graduated.'
        : `Confidence updated to ${res.data.problem.confidence}/5.`;
      Alert.alert('Re-attempt logged', detail, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (err: any) {
      setIsLoading(false);
      Alert.alert('Error', err.response?.data?.message || 'Failed to log the re-attempt.');
    }
  };

  // Delete Handler with confirmation
  const handleDelete = () => {
    Alert.alert(
      'Delete Problem',
      'Are you sure you want to permanently delete this logged problem? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              await api.delete(`/problems/${problem.id}`);
              setIsLoading(false);
              navigation.goBack();
            } catch (err: any) {
              console.error('[Delete Problem Failure]:', err);
              setIsLoading(false);
              const apiMsg = err.response?.data?.message || 'Failed to delete problem.';
              Alert.alert('Error', apiMsg);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* LeetCode Number & Title */}
        <View style={styles.row}>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>LeetCode #</Text>
            <TextInput
              style={[styles.input, isLoading && styles.disabledInput]}
              placeholder="e.g. 1"
              placeholderTextColor={theme.colors.textSecondary}
              value={leetcodeNumber}
              onChangeText={setLeetcodeNumber}
              keyboardType="number-pad"
              editable={!isLoading}
            />
          </View>
          <View style={styles.halfWidth}>
            <Text style={styles.label}>Time Taken (mins)</Text>
            <TextInput
              style={[styles.input, isLoading && styles.disabledInput]}
              placeholder="e.g. 20"
              placeholderTextColor={theme.colors.textSecondary}
              value={timeTakenMins}
              onChangeText={setTimeTakenMins}
              keyboardType="number-pad"
              editable={!isLoading}
            />
          </View>
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput
          style={[styles.input, isLoading && styles.disabledInput]}
          placeholder="e.g. Two Sum"
          placeholderTextColor={theme.colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          editable={!isLoading}
        />

        {/* Difficulty Segmented Control */}
        <Text style={styles.label}>Difficulty</Text>
        <View style={styles.segmentedControl}>
          {(['EASY', 'MEDIUM', 'HARD'] as const).map((diff) => {
            const isActive = difficulty === diff;
            const diffColors = {
              EASY: theme.colors.success,
              MEDIUM: theme.colors.warning,
              HARD: theme.colors.danger,
            }[diff];
            return (
              <TouchableOpacity
                key={diff}
                style={[
                  styles.segmentButton, 
                  isActive && { backgroundColor: diffColors }
                ]}
                onPress={() => setDifficulty(diff)}
                disabled={isLoading}
              >
                <Text style={[styles.segmentText, isActive && styles.activeSegmentText]}>{diff}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Topics Chips */}
        <Text style={styles.label}>Topics</Text>
        <View style={styles.chipsContainer}>
          {topics.map((t) => {
            const isSelected = selectedTopicIds.includes(t.id);
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.chip, isSelected && styles.activeTopicChip]}
                onPress={() => toggleTopic(t.id)}
                disabled={isLoading}
              >
                <Text style={[styles.chipText, isSelected && styles.activeChipText]}>{t.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Patterns Chips */}
        <Text style={styles.label}>Patterns</Text>
        <View style={styles.chipsContainer}>
          {patterns.map((p) => {
            const isSelected = selectedPatternIds.includes(p.id);
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, isSelected && styles.activePatternChip]}
                onPress={() => togglePattern(p.id)}
                disabled={isLoading}
              >
                <Text style={[styles.chipText, isSelected && styles.activeChipText]}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date Solved */}
        <Text style={styles.label}>Date Solved</Text>
        <TouchableOpacity 
          style={styles.dateButton} 
          onPress={() => setShowDatePicker(true)}
          disabled={isLoading}
        >
          <Text style={styles.dateButtonText}>{dateSolved.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={dateSolved}
            mode="date"
            display="default"
            onValueChange={handleDateChange}
            onDismiss={() => setShowDatePicker(false)}
          />
        )}

        {/* Solved Alone & Needs Revision Switches */}
        <View style={styles.switchRow}>
          <View style={styles.switchRowItem}>
            <View style={styles.switchLabelContainer}>
              <Text style={styles.label}>Solved Alone</Text>
            </View>
            <Switch
              value={solvedAlone}
              onValueChange={setSolvedAlone}
              disabled={isLoading}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.background}
            />
          </View>
          <View style={styles.switchRowItem}>
            <View style={styles.switchLabelContainer}>
              <Text style={styles.label}>Needs Revision</Text>
            </View>
            <Switch
              value={needsRevision}
              onValueChange={setNeedsRevision}
              disabled={isLoading}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.background}
            />
          </View>
        </View>

        {/* Confidence rating (1-5 selector) */}
        <Text style={styles.label}>Confidence (1-5)</Text>
        <View style={styles.confidenceRow}>
          {[1, 2, 3, 4, 5].map((val) => {
            const isActive = confidence === val;
            return (
              <TouchableOpacity
                key={val}
                style={[styles.confidenceButton, isActive && styles.activeConfidenceButton]}
                onPress={() => setConfidence(val)}
                disabled={isLoading}
              >
                <Text style={[styles.confidenceText, isActive && styles.activeConfidenceText]}>{val}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={styles.label}>Notes</Text>
        <TextInput
          style={[styles.notesInput, isLoading && styles.disabledInput]}
          placeholder="Write approach details, complexities, or gotchas..."
          placeholderTextColor={theme.colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          editable={!isLoading}
        />

        {/* Action Buttons */}
        <TouchableOpacity 
          style={[styles.submitButton, isLoading && styles.disabledSubmitButton]} 
          onPress={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={theme.colors.text} />
          ) : (
            <Text style={styles.submitButtonText}>{isEditMode ? 'Save Changes' : 'Log Problem'}</Text>
          )}
        </TouchableOpacity>

        {isEditMode && (
          <>
            <Text style={[styles.label, styles.historyLabel]}>History</Text>
            <ProblemHistory problemId={problem.id} />
          </>
        )}

        {isEditMode && (
          <TouchableOpacity 
            style={[styles.deleteButton, isLoading && styles.disabledSubmitButton]} 
            onPress={handleDelete}
            disabled={isLoading}
          >
            <Text style={styles.deleteButtonText}>Delete Problem Log</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* AI Recommendation Modal Overlay */}
      <Modal
        visible={isAIModalVisible}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {isAILoading ? (
              <View style={styles.modalLoadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.modalLoadingText}>Finding your next problems...</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.modalScrollContainer}>
                <Text style={styles.modalTitle}>AI Recommendations</Text>
                <SourceBadge source={aiData?.source} fallbackFrom={aiData?.fallbackFrom} />
                
                {aiData?.overallReason && (
                  <Text style={styles.overallReasonText}>{aiData.overallReason}</Text>
                )}

                <Text style={styles.sectionHeading}>Up Next Suggestions:</Text>
                
                {aiData?.recommendations?.map((rec: any, idx: number) => (
                  <View key={idx} style={styles.recCard}>
                    <Text style={styles.recProblemTitle}>#{rec.number} - {rec.title}</Text>
                    <Text style={styles.recReasonText}>{rec.reason}</Text>
                  </View>
                ))}

                <TouchableOpacity 
                  style={styles.closeModalButton}
                  onPress={() => {
                    setIsAIModalVisible(false);
                    navigation.goBack();
                  }}
                >
                  <Text style={styles.closeModalText}>Got it!</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
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
  scrollContainer: {
    padding: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  label: {
    fontFamily: theme.fonts.sans,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: 'transparent',
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  disabledInput: {
    opacity: 0.6,
  },
  historyLabel: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: theme.borderRadius.md,
    padding: 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  segmentText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs - 2,
    fontWeight: theme.typography.fontWeights.bold,
  },
  activeSegmentText: {
    color: '#ffffff',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  activeTopicChip: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    borderStyle: 'solid',
  },
  activePatternChip: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    borderStyle: 'solid',
  },
  chipText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
  },
  activeChipText: {
    color: '#ffffff',
  },
  dateButton: {
    backgroundColor: 'transparent',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dateButtonText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.sm,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  switchRowItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.md,
  },
  switchLabelContainer: {
    flex: 1,
  },
  confidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    padding: 2,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  confidenceButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.borderRadius.sm,
  },
  activeConfidenceButton: {
    backgroundColor: theme.colors.primary,
  },
  confidenceText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
  },
  activeConfidenceText: {
    color: '#ffffff',
  },
  notesInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: 'top',
    height: 100,
    marginBottom: theme.spacing.lg,
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    height: 48,
    justifyContent: 'center',
  },
  disabledSubmitButton: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  deleteButton: {
    borderColor: theme.colors.danger,
    borderWidth: 1,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xl,
    height: 48,
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
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
    width: '100%',
    maxHeight: '85%',
    borderWidth: 2,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  modalLoadingContainer: {
    padding: theme.spacing.xxl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalLoadingText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    marginTop: theme.spacing.lg,
    fontSize: theme.typography.fontSizes.sm,
    textAlign: 'center',
  },
  modalScrollContainer: {
    padding: theme.spacing.xl,
  },
  modalTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontStyle: 'italic',
    fontSize: theme.typography.fontSizes.xxl,
    fontWeight: theme.typography.fontWeights.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  overallReasonText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.sm,
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    backgroundColor: theme.colors.surfaceSecondary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionHeading: {
    color: theme.colors.primaryLight,
    fontFamily: theme.fonts.sans,
    fontWeight: theme.typography.fontWeights.bold,
    fontSize: theme.typography.fontSizes.sm,
    marginBottom: theme.spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recCard: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  recProblemTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontWeight: theme.typography.fontWeights.bold,
    fontSize: theme.typography.fontSizes.sm,
    marginBottom: 4,
  },
  recReasonText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    lineHeight: 16,
  },
  closeModalButton: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  closeModalText: {
    color: '#ffffff',
    fontFamily: theme.fonts.mono,
    fontWeight: theme.typography.fontWeights.bold,
    fontSize: theme.typography.fontSizes.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
