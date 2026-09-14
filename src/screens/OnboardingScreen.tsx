import { useRef, useState } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { AppButton, AppHost } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { OnboardingArtwork } from './onboarding/OnboardingArtwork';
import { BrandMark } from './onboarding/Illustrations';
import type { OnboardingScreenProps } from './OnboardingScreen.types';
import { useOnboardingConnection } from './onboarding/useOnboardingConnection';
import { OnboardingConnection } from './onboarding/OnboardingConnection';
import { elevation, radius, typography } from '@/theme';

const PAGES = ['history', 'sync', 'settings'] as const;

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { t } = useTranslation('onboarding');
  const { theme } = useTheme();
  const c = theme.colors;
  const pager = useRef<PagerView>(null);
  const secondaryOpacity = useRef(new Animated.Value(0)).current;
  const completing = useRef(false);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const isLast = page === PAGES.length - 1;
  const connection = useOnboardingConnection();

  const finish = async () => {
    if (completing.current) return;
    completing.current = true;
    setSaving(true);
    setError(false);
    try {
      await onComplete();
    } catch {
      setError(true);
    } finally {
      completing.current = false;
      setSaving(false);
    }
  };

  if (connection.stage !== 'intro') {
    return (
      <OnboardingConnection
        connection={connection}
        onComplete={() => void finish()}
        finishing={saving}
        completionError={error}
      />
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <View style={s.brandHeader}>
        <View style={[s.brandBadge, { backgroundColor: c.accentContainer }]}>
          <BrandMark color={c.accent as string} size={28} />
        </View>
        <Text style={[s.brandWordmark, { color: c.textPrimary }]}>Clipboard</Text>
      </View>

      <PagerView
        ref={pager}
        style={s.pager}
        initialPage={page}
        onPageSelected={({ nativeEvent }) => setPage(nativeEvent.position)}
        onPageScroll={({ nativeEvent }) => {
          secondaryOpacity.setValue(Math.max(0, nativeEvent.position + nativeEvent.offset - 1));
        }}
        scrollEnabled={!saving && !connection.busy}
      >
        {PAGES.map((kind, index) => (
          <View key={kind} collapsable={false} style={s.page}>
            <ScrollView contentContainerStyle={s.pageContent} showsVerticalScrollIndicator={false}>
              <View
                style={[
                  s.art,
                  Platform.OS === 'android' && elevation.md,
                  { backgroundColor: c.surfaceLowest, borderColor: c.separator },
                ]}
              >
                <OnboardingArtwork kind={kind} />
              </View>
              <View style={s.copy}>
                <View style={[s.stepPill, { backgroundColor: c.accentContainer }]}>
                  <Text style={[s.step, { color: c.onAccentContainer }]}>{`0${index + 1}`}</Text>
                </View>
                <Text accessibilityRole="header" style={[s.title, { color: c.textPrimary }]}>
                  {t(`intro.${kind}.title`)}
                </Text>
                <Text style={[s.body, { color: c.textSecondary }]}>{t(`intro.${kind}.body`)}</Text>
              </View>
            </ScrollView>
          </View>
        ))}
      </PagerView>

      <View style={s.footer}>
        <View
          style={s.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('intro.progress', { current: page + 1, total: PAGES.length })}
          accessibilityValue={{ min: 1, max: PAGES.length, now: page + 1 }}
        >
          {PAGES.map((kind, index) => (
            <View
              key={kind}
              style={[
                s.progressTrack,
                {
                  width: index === page ? 28 : 8,
                  backgroundColor: index === page ? c.accent : c.separator,
                },
              ]}
            />
          ))}
        </View>
        {(error || connection.error) && (
          <Text
            testID="welcome-error"
            accessibilityRole="alert"
            style={[s.error, { color: c.textSecondary }]}
          >
            {connection.error || t('intro.saveError')}
          </Text>
        )}
        <View style={s.actions}>
          <AppHost style={s.primaryHost} matchContents={{ vertical: true }}>
            <AppButton
              testID={isLast ? 'onboarding-scan' : 'onboarding-next'}
              title={t(isLast ? 'intro.scan' : 'intro.next')}
              variant="filled"
              colors={{ containerColor: c.accent, contentColor: c.onAccent }}
              fullWidth
              size="large"
              disabled={saving || connection.busy}
              onPress={
                isLast ? () => void connection.scan() : () => pager.current?.setPage(page + 1)
              }
            />
          </AppHost>
          <Animated.View
            testID="welcome-secondary-action"
            style={[
              s.secondaryClip,
              {
                width: secondaryOpacity.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 104],
                  extrapolate: 'clamp',
                }),
                opacity: secondaryOpacity,
              },
            ]}
            pointerEvents={isLast ? 'auto' : 'none'}
            accessibilityElementsHidden={!isLast}
            importantForAccessibility={isLast ? 'auto' : 'no-hide-descendants'}
          >
            <AppHost style={s.secondaryHost} matchContents={{ vertical: true }}>
              <AppButton
                testID="onboarding-skip"
                title={t('skip')}
                variant="text"
                colors={{ contentColor: c.accent }}
                fullWidth
                size="large"
                disabled={saving || connection.busy}
                onPress={() => void finish()}
              />
            </AppHost>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 2,
  },
  brandBadge: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandWordmark: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.45,
    fontFamily: Platform.OS === 'android' ? 'sans-serif' : undefined,
  },
  pager: { flex: 1 },
  page: { flex: 1 },
  pageContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 24,
  },
  art: {
    width: '100%',
    maxWidth: 340,
    height: 236,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xxl,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  copy: { width: '100%', maxWidth: 360, alignItems: 'center' },
  stepPill: {
    minWidth: 46,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  step: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  title: {
    ...typography.title1,
    textAlign: 'center',
    fontWeight: '800',
    letterSpacing: -0.55,
    fontFamily: Platform.OS === 'android' ? 'sans-serif' : undefined,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 6,
    fontFamily: Platform.OS === 'android' ? 'sans-serif' : undefined,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 10,
    paddingTop: 8,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    gap: 14,
  },
  progress: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 10 },
  progressTrack: { height: 8, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  primaryHost: { minHeight: 56, flex: 1 },
  secondaryHost: { minHeight: 50, width: 92, marginLeft: 12 },
  secondaryClip: { overflow: 'hidden' },
  error: { fontSize: 14, textAlign: 'center' },
});
