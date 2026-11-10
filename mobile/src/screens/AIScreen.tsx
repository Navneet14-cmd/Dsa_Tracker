import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator 
} from 'react-native';
import { api } from '../services/api';
import { theme } from '../config/theme';

export default function AIScreen() {
  // Weakness Analysis states
  const [strengths, setStrengths] = useState<string[]>([]);
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Study Plan states
  const [hoursInput, setHoursInput] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [totalMinutes, setTotalMinutes] = useState<number | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleAnalyzeProgress = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const response = await api.post('/ai/weakness-analysis');
      const { strengths: strList, weakAreas: weakList, recommendation: recText } = response.data;
      
      setStrengths(strList || []);
      setWeakAreas(weakList || []);
      setRecommendation(recText || '');
    } catch (error: any) {
      console.error('[AI Progress Analysis Error]:', error);
      const apiMsg = error.response?.data?.message || 'AI service is temporarily unavailable. Please try again.';
      setAnalysisError(apiMsg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateStudyPlan = async () => {
    setValidationError(null);
    setPlannerError(null);

    const hours = parseFloat(hoursInput);
    if (isNaN(hours) || !isFinite(hours) || hours <= 0) {
      setValidationError('Please enter a valid positive number for hours.');
      return;
    }

    if (hours > 12) {
      setValidationError('Study plans are capped at a maximum of 12 hours.');
      return;
    }

    setIsPlanning(true);
    const minutesAvailable = Math.round(hours * 60);

    try {
      const response = await api.post('/ai/study-plan', { minutesAvailable });
      const { tasks: planTasks, totalMinutes: planMinutes } = response.data;
      
      setTasks(planTasks || []);
      setTotalMinutes(planMinutes !== undefined ? planMinutes : 0);
    } catch (error: any) {
      console.error('[AI Study Plan Generation Error]:', error);
      const apiMsg = error.response?.data?.message || 'AI planning service is temporarily unavailable. Please try again.';
      setPlannerError(apiMsg);
    } finally {
      setIsPlanning(false);
    }
  };

  const renderBadge = (type: string) => {
    const badgeColor = {
      REVISION: theme.colors.success,
      PRACTICE: theme.colors.primaryLight,
      BREAK: theme.colors.textSecondary,
    }[type] || theme.colors.text;

    return (
      <Text style={[styles.badgeText, { color: badgeColor }]}>
        [{type}]
      </Text>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Section 1: Progress & Weakness Analysis */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Performance Insights</Text>
          <Text style={styles.sectionSubtitle}>
            Evaluate your log history and discover focus recommendations based on solved counts.
          </Text>

          <TouchableOpacity 
            style={[styles.actionButton, isAnalyzing && styles.disabledButton]} 
            onPress={handleAnalyzeProgress}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.actionButtonText}>Analyze My Progress  →</Text>
            )}
          </TouchableOpacity>

          {analysisError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>ANALYSIS_FAILURE: {analysisError}</Text>
            </View>
          )}

          {/* Analysis Results Display */}
          {(strengths.length > 0 || weakAreas.length > 0 || recommendation !== '') && (
            <View style={styles.resultsContainer}>
              {strengths.length > 0 && (
                <View style={[styles.insightCard, { borderLeftColor: theme.colors.success }]}>
                  <Text style={[styles.insightTitle, { color: theme.colors.success }]}>Strengths</Text>
                  {strengths.map((str, idx) => (
                    <Text key={idx} style={styles.insightBullet}>• {str}</Text>
                  ))}
                </View>
              )}

              {weakAreas.length > 0 && (
                <View style={[styles.insightCard, { borderLeftColor: theme.colors.danger }]}>
                  <Text style={[styles.insightTitle, { color: theme.colors.danger }]}>Weak Areas</Text>
                  {weakAreas.map((weak, idx) => (
                    <Text key={idx} style={styles.insightBullet}>• {weak}</Text>
                  ))}
                </View>
              )}

              {recommendation !== '' && (
                <View style={[styles.insightCard, { borderLeftColor: theme.colors.border }]}>
                  <Text style={[styles.insightTitle, { color: theme.colors.primary }]}>Recommendation</Text>
                  <Text style={styles.recommendationText}>{recommendation}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Separator line */}
        <View style={styles.separator} />

        {/* Section 2: Study Planner */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Study Session Planner</Text>
          <Text style={styles.sectionSubtitle}>
            Input your available hours to generate a study schedule prioritizing due revisions and patterns.
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Available Hours Today</Text>
            <TextInput
              style={[styles.input, isPlanning && styles.disabledInput]}
              placeholder="E.g. 1.5"
              placeholderTextColor={theme.colors.border}
              value={hoursInput}
              onChangeText={(text) => {
                setHoursInput(text);
                setValidationError(null);
              }}
              keyboardType="numeric"
              editable={!isPlanning}
            />
            {validationError && (
              <Text style={styles.validationErrorText}>{validationError}</Text>
            )}
          </View>

          <TouchableOpacity 
            style={[
              styles.actionButton, 
              (isPlanning || !hoursInput.trim()) && styles.disabledButton
            ]} 
            onPress={handleGenerateStudyPlan}
            disabled={isPlanning || !hoursInput.trim()}
          >
            {isPlanning ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.actionButtonText}>Generate Study Plan  →</Text>
            )}
          </TouchableOpacity>

          {plannerError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>PLANNER_FAILURE: {plannerError}</Text>
            </View>
          )}

          {/* Study Plan Results Display */}
          {totalMinutes !== null && (
            <View style={styles.resultsContainer}>
              {tasks.length === 0 ? (
                <View style={styles.emptyPlanCard}>
                  <Text style={styles.emptyPlanText}>
                    Not enough time for a scheduled task — try entering a longer session duration (e.g., at least 30 mins).
                  </Text>
                </View>
              ) : (
                <View style={styles.planCard}>
                  <View style={styles.planHeader}>
                    <Text style={styles.planHeaderTitle}>Target Study Plan</Text>
                    <Text style={styles.planHeaderTime}>TOTAL: {totalMinutes} MINS</Text>
                  </View>
                  
                  {tasks.map((task, idx) => (
                    <View key={idx} style={styles.taskItem}>
                      <View style={styles.taskTopRow}>
                        {renderBadge(task.type)}
                        <Text style={styles.taskDuration}>{task.estMinutes} MINS</Text>
                      </View>
                      <Text style={styles.taskDescription}>{task.description}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
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
    paddingBottom: theme.spacing.xxl,
  },
  section: {
    marginVertical: theme.spacing.md,
  },
  sectionHeader: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.display,
    fontStyle: 'italic',
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outlineVariant,
    borderStyle: 'dashed',
    paddingBottom: 4,
  },
  sectionSubtitle: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    lineHeight: 18,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  actionButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#ffffff',
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  separator: {
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    borderStyle: 'dashed',
    marginVertical: theme.spacing.xl,
  },
  errorContainer: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.danger,
    backgroundColor: 'rgba(142, 33, 23, 0.05)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    marginTop: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
  },
  inputGroup: {
    marginBottom: theme.spacing.md,
  },
  inputLabel: {
    fontFamily: theme.fonts.sans,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
  },
  input: {
    backgroundColor: 'transparent',
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    fontSize: theme.typography.fontSizes.sm,
  },
  disabledInput: {
    opacity: 0.6,
  },
  validationErrorText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semibold,
    marginTop: 6,
  },
  resultsContainer: {
    marginTop: theme.spacing.lg,
  },
  insightCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    marginBottom: theme.spacing.md,
  },
  insightTitle: {
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    marginBottom: theme.spacing.sm,
    textTransform: 'uppercase',
  },
  insightBullet: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    lineHeight: 18,
    marginBottom: 4,
  },
  recommendationText: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    lineHeight: 20,
  },
  emptyPlanCard: {
    backgroundColor: 'transparent',
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  emptyPlanText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    textAlign: 'center',
    lineHeight: 18,
  },
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  planHeader: {
    backgroundColor: 'rgba(201, 194, 174, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    padding: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planHeaderTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
  },
  planHeaderTime: {
    color: theme.colors.primary,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.bold,
  },
  taskItem: {
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  taskTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  badgeText: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    fontWeight: '700',
  },
  taskDuration: {
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.semibold,
  },
  taskDescription: {
    color: theme.colors.text,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    lineHeight: 18,
  },
});
