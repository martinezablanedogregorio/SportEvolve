import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import type { AthleteSummary } from '@/lib/sessionRepository';

type SessionRow = {
  id: string;
  title: string | null;
  session_type: string;
  started_at: string;
  duration_minutes: number | null;
  rpe: number | null;
  shared: boolean;
  result_text: string | null;
};

export default function SessionsScreen() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [activeAthleteId, setActiveAthleteId] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void loadAccount();
  }, []);

  useEffect(() => {
    if (activeAthleteId) void loadSessions(activeAthleteId);
  }, [activeAthleteId]);

  async function loadAccount() {
    setLoading(true);
    const { data, error } = await supabase.rpc('bootstrap_sportevolve_account', { p_display_name: null });
    if (error) {
      setLoading(false);
      return;
    }
    const loaded = (data ?? []) as AthleteSummary[];
    setAthletes(loaded);
    const saved = localStorage.getItem('sportevolve.activeAthleteId');
    const selected = loaded.find((athlete) => athlete.athlete_id === saved) ?? loaded[0];
    setActiveAthleteId(selected?.athlete_id ?? '');
  }

  async function loadSessions(athleteId: string) {
    const { data: participants, error: participantError } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('athlete_id', athleteId)
      .limit(150);

    if (participantError) {
      setSessions([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const ids = (participants ?? []).map((row) => row.session_id as string);
    if (!ids.length) {
      setSessions([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data, error } = await supabase
      .from('sessions')
      .select('id, title, session_type, started_at, duration_minutes, rpe, shared, result_text')
      .in('id', ids)
      .order('started_at', { ascending: false })
      .limit(100);

    setSessions(error ? [] : (data ?? []) as SessionRow[]);
    setLoading(false);
    setRefreshing(false);
  }

  function selectAthlete(athleteId: string) {
    localStorage.setItem('sportevolve.activeAthleteId', athleteId);
    setActiveAthleteId(athleteId);
  }

  async function refresh() {
    if (!activeAthleteId) return;
    setRefreshing(true);
    await loadSessions(activeAthleteId);
  }

  const activeAthlete = athletes.find((athlete) => athlete.athlete_id === activeAthleteId);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>HISTORIQUE</Text>
          <Text style={styles.title}>Sessions</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: '/add', params: { athleteId: activeAthleteId } })} style={styles.addButton}>
          <Text style={styles.addText}>＋</Text>
        </Pressable>
      </View>

      <View style={styles.switchRow}>
        {athletes.slice(0, 2).map((athlete) => {
          const selected = athlete.athlete_id === activeAthleteId;
          return (
            <Pressable key={athlete.athlete_id} onPress={() => selectAthlete(athlete.athlete_id)} style={[styles.chip, selected && styles.chipActive]}>
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>{athlete.display_name}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#b7d400" size="large" />
          <Text style={styles.muted}>Chargement de l’historique…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor="#b7d400" />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.summary}>{sessions.length} séance{sessions.length > 1 ? 's' : ''} enregistrée{sessions.length > 1 ? 's' : ''} pour {activeAthlete?.display_name ?? 'cet athlète'}.</Text>

          {sessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Aucune séance pour l’instant</Text>
              <Text style={styles.emptyText}>La première séance enregistrée via + Ajouter apparaîtra ici.</Text>
              <Pressable onPress={() => router.push({ pathname: '/add', params: { athleteId: activeAthleteId } })} style={styles.primaryButton}>
                <Text style={styles.primaryText}>+ Ajouter une séance</Text>
              </Pressable>
            </View>
          ) : (
            sessions.map((session) => (
              <View key={session.id} style={styles.sessionCard}>
                <View style={styles.cardTop}>
                  <View style={styles.flex}>
                    <Text style={styles.cardTag}>{sessionTypeLabel(session.session_type)}{session.shared ? ' · DUO' : ''}</Text>
                    <Text style={styles.cardTitle}>{session.title || 'Séance'}</Text>
                  </View>
                  <Text style={styles.cardDate}>{formatDay(session.started_at)}</Text>
                </View>
                <View style={styles.metricsRow}>
                  <Metric label="Heure" value={formatTime(session.started_at)} />
                  <Metric label="Durée" value={session.duration_minutes != null ? `${session.duration_minutes} min` : '—'} />
                  <Metric label="RPE" value={session.rpe != null ? `${session.rpe}/10` : '—'} />
                </View>
                {session.result_text ? <Text style={styles.result}>{session.result_text}</Text> : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function sessionTypeLabel(value: string) {
  const labels: Record<string, string> = {
    cross_training: 'Cross training',
    strength: 'Force',
    weightlifting: 'Haltéro',
    gymnastics: 'Gymnastique',
    running: 'Running',
    erg: 'Erg',
    machine: 'Machine',
    hyrox: 'Hyrox',
    mobility: 'Mobilité',
    other: 'Autre',
  };
  return labels[value] ?? value;
}

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#090b0f' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#273039', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#dce2e6', fontSize: 22, fontWeight: '800' },
  addButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#b7d400', alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#0c1009', fontSize: 27, fontWeight: '500', lineHeight: 29 },
  eyebrow: { color: '#9ab300', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#f3f6f8', fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  switchRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 18, paddingBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: '#29323a', backgroundColor: '#10151a' },
  chipActive: { backgroundColor: '#202817', borderColor: '#526327' },
  chipText: { color: '#75818b', fontSize: 10, fontWeight: '900' },
  chipTextActive: { color: '#d7e888' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#7f8a95', fontSize: 11, fontWeight: '700' },
  content: { padding: 18, paddingTop: 8, paddingBottom: 45 },
  summary: { color: '#727e88', fontSize: 10, lineHeight: 15, marginBottom: 12 },
  emptyCard: { padding: 18, borderRadius: 19, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#252e36' },
  emptyTitle: { color: '#eef2f4', fontSize: 18, fontWeight: '900' },
  emptyText: { color: '#77838d', fontSize: 10, lineHeight: 15, marginTop: 6 },
  primaryButton: { marginTop: 16, minHeight: 48, borderRadius: 14, backgroundColor: '#b7d400', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#0c1009', fontSize: 11, fontWeight: '900' },
  sessionCard: { padding: 15, borderRadius: 18, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#252e36', marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTag: { color: '#9ab300', fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  cardTitle: { color: '#eef2f4', fontSize: 16, fontWeight: '900', marginTop: 5 },
  cardDate: { color: '#8b969f', fontSize: 10, fontWeight: '800' },
  metricsRow: { flexDirection: 'row', gap: 7, marginTop: 13 },
  metric: { flex: 1, padding: 9, borderRadius: 12, backgroundColor: '#0b1014', borderWidth: 1, borderColor: '#252e36' },
  metricLabel: { color: '#66727c', fontSize: 7, fontWeight: '900', textTransform: 'uppercase' },
  metricValue: { color: '#dce2e6', fontSize: 11, fontWeight: '900', marginTop: 4 },
  result: { color: '#8c989f', fontSize: 9, lineHeight: 14, marginTop: 11 },
});
