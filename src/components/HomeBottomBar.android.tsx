import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import type { SelectModeBottomBarProps } from './HomeBottomBar.types';
import { elevation } from '@/theme';

export function SelectModeBottomBar({
  disabled,
  onCopy,
  onShare,
  onDelete,
  theme,
}: SelectModeBottomBarProps) {
  const { t } = useTranslation('common');
  const bg = { backgroundColor: theme.colors.surfaceHigh };
  const ic = disabled ? theme.colors.border : theme.colors.textPrimary;
  return (
    <View style={s.selectRow}>
      <Pressable
        onPress={onCopy}
        disabled={disabled}
        style={[s.circle, elevation.md, bg]}
        accessibilityRole="button"
        accessibilityLabel={t('action.copy')}
        accessibilityState={{ disabled }}
      >
        <Ionicons name="copy-outline" size={20} color={ic} />
      </Pressable>
      <Pressable
        onPress={onShare}
        disabled={disabled}
        style={[s.circle, elevation.md, bg]}
        accessibilityRole="button"
        accessibilityLabel={t('action.share')}
        accessibilityState={{ disabled }}
      >
        <Ionicons name="share-outline" size={20} color={ic} />
      </Pressable>
      <Pressable
        onPress={onDelete}
        disabled={disabled}
        style={[s.circle, elevation.md, bg]}
        accessibilityRole="button"
        accessibilityLabel={t('action.delete')}
        accessibilityState={{ disabled }}
      >
        <Ionicons
          name="trash-outline"
          size={20}
          color={disabled ? theme.colors.border : '#F44336'}
        />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectRow: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
});
