import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { BrandMark, CompanionArt, LanArt } from './Illustrations';

type ArtworkKind = 'history' | 'sync' | 'settings';

export function OnboardingArtwork({ kind }: { kind: ArtworkKind }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const art =
    kind === 'history' ? (
      <View style={[s.brandHalo, { backgroundColor: c.accentContainer }]}>
        <BrandMark color={c.accent as string} size={138} />
      </View>
    ) : kind === 'sync' ? (
      <CompanionArt
        accent={c.accent as string}
        line={c.separator as string}
        surface={c.surfaceHigh as string}
        bg={c.surfaceLowest as string}
        fg2={c.textSecondary as string}
        width={268}
      />
    ) : (
      <LanArt
        accent={c.accent as string}
        line={c.separator as string}
        bg={c.surfaceLowest as string}
        fg2={c.textSecondary as string}
        width={266}
      />
    );

  return (
    <View
      style={s.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[s.orbit, s.orbitLarge, { borderColor: c.accentContainer }]} />
      <View style={[s.orbit, s.orbitSmall, { borderColor: c.separator }]} />
      {art}
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandHalo: {
    width: 174,
    height: 174,
    borderRadius: 54,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-3deg' }],
  },
  orbit: {
    position: 'absolute',
    borderWidth: 1,
    opacity: 0.85,
  },
  orbitLarge: {
    width: 278,
    height: 278,
    borderRadius: 139,
  },
  orbitSmall: {
    width: 218,
    height: 218,
    borderRadius: 109,
    opacity: 0.5,
  },
});
