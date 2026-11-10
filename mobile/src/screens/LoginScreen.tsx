import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../services/api';
import { theme } from '../config/theme';

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAuth = useAuthStore((state) => state.setAuth);
  const setTaxonomy = useAuthStore((state) => state.setTaxonomy);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please fill in all fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loginResponse = await api.post('/auth/login', {
        email: trimmedEmail,
        password,
      });

      const { token, user } = loginResponse.data;

      const headers = { Authorization: `Bearer ${token}` };
      const [topicsResponse, patternsResponse] = await Promise.all([
        api.get('/topics', { headers }),
        api.get('/patterns', { headers }),
      ]);

      setTaxonomy(topicsResponse.data.topics, patternsResponse.data.patterns);
      await setAuth(token, user);
    } catch (err: any) {
      console.error('[Login Error]:', err);
      const apiMsg = err.response?.data?.message || 'Unable to connect to the server. Please check your network connection.';
      setError(apiMsg);
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Algorithm Ledger</Text>
        <Text style={styles.subtitle}>A Permanent Record of Logarithmic Growth</Text>
      </View>

      <View style={styles.formCard}>
        {/* Binding Area representing an index card top edge */}
        <View style={styles.cardHeader}>
          <Text style={styles.docRef}>DOC_REF: AUTH_V1.0</Text>
          <View style={styles.holesContainer}>
            <View style={styles.hole} />
            <View style={styles.hole} />
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.sectionTitle}>Security Access</Text>
          <Text style={styles.sectionSubtitle}>Please provide your credentials to unlock the ledger.</Text>

          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>AUTHENTICATION_FAILURE: {error}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Librarian Identifier</Text>
            <TextInput
              style={[styles.input, isLoading && styles.disabledInput]}
              placeholder="E.g. ALGO_USER_04"
              placeholderTextColor={theme.colors.border}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!isLoading}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Security Key</Text>
            <TextInput
              style={[styles.input, isLoading && styles.disabledInput]}
              placeholder="••••••••••••"
              placeholderTextColor={theme.colors.border}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              editable={!isLoading}
            />
          </View>

          <TouchableOpacity 
            style={[styles.button, isLoading && styles.disabledButton]} 
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Initiate Session  →</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => navigation.navigate('Register')}
            disabled={isLoading}
          >
            <Text style={[styles.switchText, isLoading && styles.disabledSwitchText]}>
              New Librarian? Register your ledger
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontStyle: 'italic',
    fontSize: theme.typography.fontSizes.xxxl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: theme.fonts.mono,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
  formCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: 'rgba(201, 194, 174, 0.08)',
  },
  docRef: {
    fontFamily: theme.fonts.mono,
    fontSize: 9,
    color: theme.colors.border,
  },
  holesContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  hole: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  cardBody: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
  },
  sectionTitle: {
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  sectionSubtitle: {
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  errorBanner: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.danger,
    backgroundColor: 'rgba(142, 33, 23, 0.05)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    marginBottom: theme.spacing.lg,
  },
  errorText: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.sans,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
  },
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontFamily: theme.fonts.sans,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    opacity: 0.7,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    height: 48,
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.7,
    backgroundColor: theme.colors.border,
  },
  buttonText: {
    color: '#ffffff',
    fontFamily: theme.fonts.mono,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  switchText: {
    color: theme.colors.primaryLight,
    fontFamily: theme.fonts.sans,
    fontWeight: theme.typography.fontWeights.semibold,
    textAlign: 'center',
    fontSize: theme.typography.fontSizes.sm,
  },
  disabledSwitchText: {
    opacity: 0.5,
  },
});
