import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { CATEGORIES, HAZARD_LEVELS } from '../constants/categories';
import { Report } from '../types';
import Icon from './Icon';
import LazyImage from './LazyImage';

interface ReportCardProps {
  report: Report;
  onPress: () => void;
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    draft: COLORS.statusDraft,
    submitted: COLORS.statusSubmitted,
    acknowledged: COLORS.statusAcknowledged,
    in_progress: COLORS.statusInProgress,
    resolved: COLORS.statusResolved,
    closed: COLORS.statusClosed,
    rejected: COLORS.statusRejected,
  };
  return map[status] || COLORS.textSecondary;
}

function getTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function ReportCard({ report, onPress }: ReportCardProps) {
  const category = CATEGORIES.find((c) => c.key === report.category);
  const hazard = HAZARD_LEVELS.find((h) => h.key === report.severity.hazardLevel);
  const timeAgo = getTimeAgo(report.createdAt);
  const thumbnail = report.media.find((m) => m.type === 'photo');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Icon name={category?.icon || 'clipboard-text'} size={24} color={COLORS.primary} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.categoryLabel}>{category?.label || report.category}</Text>
          <Text style={styles.location}>
            {report.location.address || report.location.city || 'Unknown location'}
          </Text>
        </View>
        {thumbnail && (thumbnail.thumbnailUrl || thumbnail.uploadedUrl) && (
          <LazyImage
            uri={thumbnail.thumbnailUrl || thumbnail.uploadedUrl}
            style={styles.thumbnail}
            fallbackIcon={<Icon name="image-outline" size={20} color={COLORS.textLight} />}
          />
        )}
      </View>

      {report.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {report.description}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(report.status) }]}>
            <Text style={styles.statusText}>{report.status.replace('_', ' ')}</Text>
          </View>
          {hazard && (
            <View style={[styles.hazardBadge, { backgroundColor: hazard.color + '20' }]}>
              <Text style={[styles.hazardText, { color: hazard.color }]}>{hazard.label}</Text>
            </View>
          )}
          <Text style={styles.timeAgo}>{timeAgo}</Text>
        </View>
        <View style={styles.votes}>
          <View style={styles.voteItem}>
            <Icon name="thumb-up-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.voteText}>{report.upvoteCount}</Text>
          </View>
          <View style={styles.voteItem}>
            <Icon name="check-circle-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.voteText}>{report.confirmCount}</Text>
          </View>
          {report.media.length > 0 && (
            <View style={styles.voteItem}>
              <Icon name="camera-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.voteText}>{report.media.length}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  headerText: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.text,
  },
  location: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.sm,
    marginLeft: SPACING.sm,
    backgroundColor: COLORS.divider,
  },
  description: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textOnPrimary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  hazardBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
  },
  hazardText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
  },
  timeAgo: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textLight,
  },
  votes: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  voteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  voteText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
});
