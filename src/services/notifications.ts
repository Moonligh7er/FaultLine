import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  // Check permissions
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reports', {
      name: 'Report Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1E88E5',
    });

    await Notifications.setNotificationChannelAsync('community', {
      name: 'Community Activity',
      importance: Notifications.AndroidImportance.DEFAULT,
    });

    await Notifications.setNotificationChannelAsync('escalations', {
      name: 'Authority Responses',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#4CAF50',
    });
  }

  // Get push token
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // Save token to user profile in Supabase
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', session.user.id);
  }

  return token;
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>,
  channelId?: string
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      ...(Platform.OS === 'android' && channelId ? { channelId } : {}),
    },
    trigger: null, // Immediate
  });
}

// ============================================================
// Supabase Realtime Subscriptions
// ============================================================

let realtimeSubscription: ReturnType<typeof supabase.channel> | null = null;

export function subscribeToReportUpdates(
  userId: string,
  onUpdate: (payload: any) => void
) {
  // Unsubscribe from any existing subscription
  unsubscribeFromReportUpdates();

  realtimeSubscription = supabase
    .channel('report-updates')

    // Listen for status changes on user's reports
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'reports',
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        const oldStatus = payload.old?.status;
        const newStatus = payload.new?.status;
        const category = payload.new?.category?.replace('_', ' ') || 'Issue';
        const city = payload.new?.city || '';

        if (oldStatus !== newStatus) {
          const messages: Record<string, string> = {
            acknowledged: `Your ${category} report in ${city} has been acknowledged by officials!`,
            in_progress: `Great news! Work has started on the ${category} you reported in ${city}.`,
            resolved: `The ${category} you reported in ${city} has been resolved! Thank you!`,
            rejected: `Your ${category} report in ${city} was reviewed but could not be processed.`,
          };

          const message = messages[newStatus];
          if (message) {
            await sendLocalNotification(
              `Report ${newStatus.replace('_', ' ')}`,
              message,
              { reportId: payload.new.id, screen: 'ReportDetail' },
              'reports'
            );
          }
        }

        onUpdate(payload);
      }
    )

    // Listen for upvotes/confirms on user's reports
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'report_votes',
      },
      async (payload) => {
        const voteType = payload.new?.vote_type;
        const reportId = payload.new?.report_id;

        // Check if this vote is on one of the user's reports
        const { data: report } = await supabase
          .from('reports')
          .select('user_id, category, city')
          .eq('id', reportId)
          .single();

        if (report?.user_id === userId) {
          const action = voteType === 'upvote' ? 'upvoted' : 'confirmed';
          const category = report.category?.replace('_', ' ') || 'issue';

          await sendLocalNotification(
            `Report ${action}!`,
            `Someone ${action} your ${category} report${report.city ? ` in ${report.city}` : ''}.`,
            { reportId, screen: 'ReportDetail' },
            'community'
          );
        }
      }
    )

    // Listen for cluster escalations (authority was contacted)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'report_clusters',
      },
      async (payload) => {
        const oldStatus = payload.old?.status;
        const newStatus = payload.new?.status;

        if (oldStatus !== 'submitted' && newStatus === 'submitted') {
          const category = payload.new?.category?.replace('_', ' ') || 'issue';
          const city = payload.new?.city || 'your area';

          // Check if user has a report in this cluster
          const { data: link } = await supabase
            .from('cluster_reports')
            .select('report_id')
            .eq('cluster_id', payload.new.id);

          if (link && link.length > 0) {
            const reportIds = link.map((l: any) => l.report_id);
            const { data: userReport } = await supabase
              .from('reports')
              .select('id')
              .eq('user_id', userId)
              .in('id', reportIds)
              .limit(1);

            if (userReport && userReport.length > 0) {
              await sendLocalNotification(
                'Officials contacted!',
                `The ${category} issue in ${city} with ${payload.new.report_count} reports has been escalated to authorities.`,
                { clusterId: payload.new.id, screen: 'Dashboard' },
                'escalations'
              );
            }
          }
        }
      }
    )

    .subscribe();
}

export function unsubscribeFromReportUpdates() {
  if (realtimeSubscription) {
    supabase.removeChannel(realtimeSubscription);
    realtimeSubscription = null;
  }
}
