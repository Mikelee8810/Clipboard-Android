import { View, Text, TextInput, StyleSheet, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { TopRightMenu } from './android/TopRightMenu';
import type {
  DefaultTopBarProps,
  SearchTopBarProps,
  SelectModeTopBarProps,
} from './HomeTopBar.types';
import { HistoryFilterTags } from '@/components/HistoryFilterTags';
import { elevation } from '@/theme';

export function DefaultTopBar({ onSearch, onSettings, onSelectMode, theme }: DefaultTopBarProps) {
  const { t } = useTranslation('home');
  return (
    <View style={s.row}>
      <View style={s.brand} accessibilityRole="header">
        <View style={[s.brandIcon, elevation.md, { backgroundColor: theme.colors.accent }]}>
          <Ionicons name="clipboard" size={21} color={theme.colors.onAccent} />
        </View>
        <Text numberOfLines={1} style={[s.brandTitle, { color: theme.colors.textPrimary }]}>Clipboard</Text>
      </View>
      <View style={s.actions}>
        <Pressable
          onPress={onSelectMode}
          style={[
            s.pill,
            elevation.sm,
            { backgroundColor: theme.colors.surfaceLowest, borderColor: theme.colors.separator },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('action.select', { ns: 'common' })}
        >
          <Text style={[s.pillText, { color: theme.colors.textPrimary }]}>
            {t('action.select', { ns: 'common' })}
          </Text>
        </Pressable>
        <Pressable
          testID="history-search-open"
          onPress={onSearch}
          style={[
            s.iconBtn,
            elevation.sm,
            { backgroundColor: theme.colors.surfaceLowest, borderColor: theme.colors.separator },
          ]}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.search')}
        >
          <Ionicons name="search" size={22} color={theme.colors.textPrimary} />
        </Pressable>
        <TopRightMenu
          testID="home-menu"
          items={[{ label: t('action.settings', { ns: 'common' }), onPress: onSettings }]}
        />
      </View>
    </View>
  );
}

export function SearchTopBar({
  searchText,
  onChangeText,
  selectedKinds,
  selectedDate,
  hasActiveFilters,
  onOpenFilters,
  onRemoveKind,
  onClearDateFilter,
  onClose,
  theme,
}: SearchTopBarProps) {
  const { t } = useTranslation('home');
  const bg = { backgroundColor: theme.colors.surfaceHigh };

  return (
    <View style={s.searchWrap}>
      <View style={s.searchRow}>
        <View style={s.boxWrap}>
          <View style={[s.searchBox, elevation.sm, bg]}>
            <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
            <TextInput
              testID="history-search-input"
              style={[s.searchInput, { color: theme.colors.textPrimary }]}
              value={searchText}
              onChangeText={onChangeText}
              placeholder={t('topBar.searchPlaceholder')}
              placeholderTextColor={theme.colors.textSecondary}
              autoFocus
            />
            {searchText.length > 0 && (
              <Pressable
                onPress={() => onChangeText('')}
                hitSlop={8}
                accessibilityRole="button"
                testID="history-search-clear"
                accessibilityLabel={t('a11y.clearSearch')}
              >
                <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>
        <Pressable
          onPress={onOpenFilters}
          style={[s.circle, elevation.md, bg]}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.searchFilters')}
        >
          <Ionicons
            name={hasActiveFilters ? 'filter-circle' : 'filter-circle-outline'}
            size={21}
            color={hasActiveFilters ? theme.colors.accent : theme.colors.textPrimary}
          />
        </Pressable>
        <Pressable
          testID="history-search-close"
          onPress={onClose}
          style={[s.circle, elevation.md, bg]}
          accessibilityRole="button"
          accessibilityLabel={t('action.close', { ns: 'common' })}
        >
          <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <HistoryFilterTags
        selectedKinds={selectedKinds}
        selectedDate={selectedDate}
        onRemoveKind={onRemoveKind}
        onClearDateFilter={onClearDateFilter}
        theme={theme}
      />
    </View>
  );
}

export function SelectModeTopBar({
  count,
  allSelected,
  onSelectAll,
  onDone,
  theme,
}: SelectModeTopBarProps) {
  const { t } = useTranslation('home');
  return (
    <View style={s.row}>
      <Text style={[s.selectCount, { color: theme.colors.textPrimary }]}>
        {t('topBar.selectedCount', { n: count })}
      </Text>
      <View style={s.actions}>
        <Pressable
          onPress={onSelectAll}
          style={[s.pill, elevation.sm, { backgroundColor: theme.colors.surfaceHigh }]}
          accessibilityRole="button"
        >
          <Text style={[s.pillText, { color: theme.colors.textPrimary }]}>
            {allSelected ? t('topBar.deselectAll') : t('action.selectAll', { ns: 'common' })}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDone}
          style={[s.pill, elevation.sm, { backgroundColor: theme.colors.surfaceHigh }]}
          accessibilityRole="button"
        >
          <Text style={[s.pillText, { color: theme.colors.textPrimary }]}>
            {t('action.done', { ns: 'common' })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 68 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  brandIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.7,
    fontFamily: 'sans-serif',
    flexShrink: 1,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 10, flexShrink: 0 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectCount: { fontSize: 14, fontWeight: '600' },
  pill: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillText: { fontSize: 14, fontWeight: '500' },
  searchWrap: { gap: 6 },
  searchRow: { flexDirection: 'row', alignItems: 'center', height: 52, gap: 8 },
  boxWrap: { flex: 1 },
  searchBox: {
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
