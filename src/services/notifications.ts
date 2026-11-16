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

// prompt=false (app start) only registers if the user already granted
// permission; the system prompt is shown in context instead — right after the
// user's first report ("get updates when the city responds").
export async function registerForPushNotifications(
  { prompt = false }: { prompt?: boolean } = {},
): Promise<string | null> {
  // Check permissions
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted' && prompt) {
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
let subscriptionGeneration = 0;

// Realtime "in" filters accept at most 100 values.
const MAX_WATCHED_REPORTS = 100;

export function subscribeToReportUpdates(
  _userId: string,
  onUpdate: (payload: any) => void
) {
  // Unsubscribe from any existing subscription
  unsubscribeFromReportUpdates();
  const generation = ++subscriptionGeneration;

  // reports.user_id isn't readable, so the caller's reports (anonymous ones
  // included) come from my_reports() and are watched by id.
  supabase
    .rpc('my_reports')
    .select('id')
    .limit(MAX_WATCHED_REPORTS)
    .then(({ data }) => {
      if (generation !== subscriptionGeneration) return; // superseded or unsubscribed
      const ids = ((data as { id: string }[] | null) || []).map((r) => r.id);
      realtimeSubscription = buildChannel(ids, onUpdate);
    }, (err: any) => console.warn('[realtime] my_reports:', err?.message || err));
}

function buildChannel(myReportIds: string[], onUpdate: (payload: any) => void) {
  let channel = supabase.channel('report-updates');

  // Listen for status changes on user's reports
  if (myReportIds.length > 0) {
    channel = channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'reports',
        filter: `id=in.(${myReportIds.join(',')})`,
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
    );
  }

  // Votes on the user's reports aren't watched here: report_votes is
  // readable only by the voter, so realtime never delivers other people's
  // votes to this client. Counts arrive with the report UPDATE above.
  return channel
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
              .rpc('my_reports')
              .select('id')
              .in('id', reportIds)
              .limit(1);

            if (Array.isArray(userReport) && userReport.length > 0) {
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
  subscriptionGeneration++;
  if (realtimeSubscription) {
    supabase.removeChannel(realtimeSubscription);
    realtimeSubscription = null;
  }
}
