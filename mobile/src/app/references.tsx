import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import type { AthleteSummary } from '@/lib/sessionRepository';

type PerformanceRow = {
  id: string;
  movement_id: string;
  record_kind: 'actual_pr' | 'set_reference' | 'estimated' | 'benchmark_result';
  metric_type: string;
  value: number | null;
  unit: string | null;
  load_kg: number | null;
  reps: number | null;
  estimate_formula: string | null;
  machine_identity: string | null;
  performed_at: string;
  movements: {
    name: string;
    discipline: string;
    machine_identity_required: boolean;
  } | null;
};

type ReferenceCard = {
  key: string;
  movementId: string;
  name: string;
  discipline: string;
  machineIdentity: string | null;
  primary: PerformanceRow;
  historyCount: number;
};

const DISCIPLINE_ORDER = ['strength', 'weightlifting', 'gymnastics', 'running', 'erg', 'machine', 'functional', 'other'];

export default function ReferencesScreen() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [activeAthleteId, setActiveAthleteId] = useState('');
  const [entries, setEntries] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadAccount();
  }, []);

  useEffect(() => {
    if (activeAthleteId) void loadReferences(activeAthleteId);
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

  async function loadReferences(athleteId: string) {
    setLoading(true);
    const { data, error } = await supabase
      .from('performance_entries')
      .select('id, movement_id, record_kind, metric_type, value, unit, load_kg, reps, estimate_formula, machine_identity, performed_at, movements(name, discipline, machine_identity_required)')
      .eq('athlete_id', athleteId)
      .not('movement_id', 'is', null)
      .order('performed_at', { ascending: false })
      .limit(500);

    setEntries(error ? [] : ((data ?? []) as unknown as PerformanceRow[]));
    setLoading(false);
  }

  function selectAthlete(athleteId: string) {
    localStorage.setItem('sportevolve.activeAthleteId', athleteId);
    setActiveAthleteId(athleteId);
  }

  const cards = useMemo(() => buildReferenceCards(entries), [entries]);
  const grouped = useMemo(() => {
    const result = new Map<string, ReferenceCard[]>();
    for (const card of cards) {
      const group = result.get(card.discipline) ?? [];
      group.push(card);
      result.set(card.discipline, group);
    }
    return result;
  }, [cards]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>CAPACITÉ</Text>
          <Text style={styles.title}>Références</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: '/add', params: { athleteId: activeAthleteId } })} style={styles.addButton}><Text style={styles.addText}>＋</Text></Pressable>
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
        <View style={styles.center}><ActivityIndicator color="#b7d400" size="large" /><Text style={styles.muted}>Calcul des références…</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Réalisé ≠ estimé</Text>
            <Text style={styles.infoText}>SportEvolve donne toujours priorité au vrai 1RM. Sans test max explicite, une série lourde reste une meilleure série enregistrée ou un e1RM clairement identifié comme estimation.</Text>
          </View>

          {cards.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Aucune référence calculée</Text>
              <Text style={styles.emptyText}>Enregistre une séance avec charges et répétitions. Les premières meilleures séries et e1RM apparaîtront automatiquement ici.</Text>
              <Pressable onPress={() => router.push({ pathname: '/add', params: { athleteId: activeAthleteId } })} style={styles.primaryButton}><Text style={styles.primaryText}>+ Ajouter une séance</Text></Pressable>
            </View>
          ) : (
            DISCIPLINE_ORDER.map((discipline) => {
              const items = grouped.get(discipline);
              if (!items?.length) return null;
              return (
                <View key={discipline} style={styles.group}>
                  <Text style={styles.groupTitle}>{disciplineLabel(discipline)}</Text>
                  {items.map((card) => <ReferenceItem key={card.key} card={card} />)}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function buildReferenceCards(entries: PerformanceRow[]) {
  const groups = new Map<string, PerformanceRow[]>();
  for (const entry of entries) {
    if (!entry.movements) continue;
    const machineKey = entry.machine_identity ?? '';
    const key = `${entry.movement_id}:${machineKey}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const cards: ReferenceCard[] = [];
  for (const [key, rows] of groups) {
    const actual = bestByValue(rows.filter((row) => row.record_kind === 'actual_pr' && row.metric_type === '1rm'));
    const estimated = bestByValue(rows.filter((row) => row.record_kind === 'estimated' && row.metric_type === 'e1rm_epley'));
    const bestSet = bestSetReference(rows.filter((row) => row.record_kind === 'set_reference'));
    const primary = actual ?? estimated ?? bestSet;
    if (!primary || !primary.movements) continue;

    cards.push({
      key,
      movementId: primary.movement_id,
      name: primary.movements.name,
      discipline: primary.movements.discipline,
      machineIdentity: primary.machine_identity,
      primary,
      historyCount: rows.length,
    });
  }

  return cards.sort((a, b) => {
    const disciplineDelta = DISCIPLINE_ORDER.indexOf(a.discipline) - DISCIPLINE_ORDER.indexOf(b.discipline);
    return disciplineDelta || a.name.localeCompare(b.name, 'fr');
  });
}

function bestByValue(rows: PerformanceRow[]) {
  return rows.reduce<PerformanceRow | null>((best, row) => {
    if (row.value == null) return best;
    if (!best || best.value == null || Number(row.value) > Number(best.value)) return row;
    return best;
  }, null);
}

function bestSetReference(rows: PerformanceRow[]) {
  return rows.reduce<PerformanceRow | null>((best, row) => {
    if (row.load_kg == null) return best;
    if (!best || best.load_kg == null || Number(row.load_kg) > Number(best.load_kg)) return row;
    if (Number(row.load_kg) === Number(best.load_kg) && Number(row.reps ?? 0) > Number(best.reps ?? 0)) return row;
    return best;
  }, null);
}

function ReferenceItem({ card }: { card: ReferenceCard }) {
  const row = card.primary;
  const isActual = row.record_kind === 'actual_pr';
  const isEstimated = row.record_kind === 'estimated';
  const label = isActual ? '1RM RÉALISÉ' : isEstimated ? 'e1RM ESTIMÉ · EPLEY' : 'MEILLEURE SÉRIE ENREGISTRÉE';
  const value = isActual || isEstimated
    ? `${formatNumber(row.value)} kg`
    : row.load_kg != null
      ? `${formatNumber(row.load_kg)} kg × ${formatNumber(row.reps)}`
      : row.value != null
        ? `${formatNumber(row.value)}${row.unit ? ` ${row.unit}` : ''}`
        : '—';

  return (
    <View style={styles.referenceCard}>
      <View style={styles.referenceTop}>
        <View style={styles.flex}>
          <Text style={styles.referenceName}>{card.name}</Text>
          {card.machineIdentity ? <Text style={styles.machine}>{card.machineIdentity}</Text> : null}
        </View>
        <Text style={[styles.kind, isActual && styles.kindActual, isEstimated && styles.kindEstimated]}>{label}</Text>
      </View>
      <Text style={styles.referenceValue}>{value}</Text>
      {isEstimated && row.load_kg != null && row.reps != null ? <Text style={styles.detail}>Calculé depuis {formatNumber(row.load_kg)} kg × {formatNumber(row.reps)} · jamais confondu avec un vrai 1RM.</Text> : null}
      <View style={styles.referenceBottom}>
        <Text style={styles.date}>{new Date(row.performed_at).toLocaleDateString('fr-FR')}</Text>
        <Text style={styles.history}>{card.historyCount} événement{card.historyCount > 1 ? 's' : ''} de référence</Text>
      </View>
    </View>
  );
}

function formatNumber(value: number | null) {
  if (value == null) return '—';
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function disciplineLabel(value: string) {
  const labels: Record<string, string> = {
    strength: 'Force',
    weightlifting: 'Haltérophilie',
    gymnastics: 'Gymnastique',
    running: 'Running',
    erg: 'Ergs',
    machine: 'Machines',
    functional: 'Fonctionnel',
    other: 'Autres',
  };
  return labels[value] ?? value;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#090b0f' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#273039', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#dce2e6', fontSize: 22, fontWeight: '800' },
  addButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#b7d400', alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#0c1009', fontSize: 27, lineHeight: 29 },
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
  infoCard: { padding: 15, borderRadius: 17, backgroundColor: '#141c15', borderWidth: 1, borderColor: '#3a4727', marginBottom: 20 },
  infoTitle: { color: '#dce985', fontSize: 12, fontWeight: '900' },
  infoText: { color: '#7d8b82', fontSize: 9, lineHeight: 14, marginTop: 5 },
  emptyCard: { padding: 18, borderRadius: 19, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#252e36' },
  emptyTitle: { color: '#eef2f4', fontSize: 18, fontWeight: '900' },
  emptyText: { color: '#77838d', fontSize: 10, lineHeight: 15, marginTop: 6 },
  primaryButton: { marginTop: 16, minHeight: 48, borderRadius: 14, backgroundColor: '#b7d400', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#0c1009', fontSize: 11, fontWeight: '900' },
  group: { marginBottom: 20 },
  groupTitle: { color: '#dbe1e5', fontSize: 15, fontWeight: '900', marginBottom: 9 },
  referenceCard: { padding: 15, borderRadius: 18, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#252e36', marginBottom: 9 },
  referenceTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  referenceName: { color: '#eef2f4', fontSize: 15, fontWeight: '900' },
  machine: { color: '#78848d', fontSize: 8, fontWeight: '800', marginTop: 3 },
  kind: { color: '#9aa4aa', fontSize: 7, fontWeight: '900', letterSpacing: 0.5, textAlign: 'right', maxWidth: 110 },
  kindActual: { color: '#c8dd59' },
  kindEstimated: { color: '#d3bd72' },
  referenceValue: { color: '#f2f5f6', fontSize: 26, fontWeight: '900', letterSpacing: -0.8, marginTop: 11 },
  detail: { color: '#7d878e', fontSize: 8, lineHeight: 13, marginTop: 5 },
  referenceBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2b343c' },
  date: { color: '#6e7a84', fontSize: 8, fontWeight: '800' },
  history: { color: '#6e7a84', fontSize: 8, fontWeight: '800' },
});
