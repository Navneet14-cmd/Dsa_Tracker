import { Platform } from 'react-native';

export const theme = {
  colors: {
    background: '#fdf8f7',      // Warm manila background
    surface: '#ffffff',         // White card surface
    surfaceSecondary: '#fbfaf5',// Manila index card secondary surface
    border: '#c9c2ae',          // Gold-grey border
    outlineVariant: '#cbc6bd',  // Light dashed divider
    text: '#070705',            // Deep charcoal ink
    textSecondary: '#494740',   // Graphite grey
    primary: '#070705',         // Primary Ink CTA button fill
    primaryLight: '#35507a',    // Fountain Pen Blue
    success: '#2d5a27',         // Pine Green
    danger: '#8e2117',          // Brick Red
    warning: '#d97706',         // Amber Yellow
    gridLine: 'rgba(201, 194, 174, 0.15)', // Manila grid line
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  fonts: {
    display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    mono: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'sans-serif' }),
  },
  typography: {
    fontSizes: {
      xs: 12,
      sm: 14,
      md: 16,
      lg: 18,
      xl: 20,
      xxl: 24,
      xxxl: 32,
    },
    fontWeights: {
      regular: '400' as const,
      medium: '500' as const,
      semibold: '600' as const,
      bold: '700' as const,
    },
  },
  borderRadius: {
    sm: 2,
    md: 4,
    lg: 8,
    xl: 12,
    round: 9999,
  },
};
