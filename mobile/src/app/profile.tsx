import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import type { AthleteSummary } from '@/lib/sessionRepository';

type Goal = 'maintenance' | 'recomposition' | 'fat_loss' | 'muscle_gain';

const GOALS: Array<[Goal, string]> = [
  ['maintenance', 'Maintien'],
  ['recomposition', 'Recomposition'],
  ['fat_loss', 'Perte de gras'],
  ['muscle_gain', 'Prise de muscle'],
];

export default function ProfileScreen() {
  const router = useRouter();
  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [activeAthleteId, setActiveAthleteId] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState('unspecified');
  const [weightKg, setWeightKg] = useState('');
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [goal, setGoal] = useState<Goal>('maintenance');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadAccount();
  }, []);

  useEffect(() => {
    if (activeAthleteId) void loadProfile(activeAthleteId);
  }, [activeAthleteId]);

  async function loadAccount() {
    setLoading(true);
    const { data, error } = await supabase.rpc('bootstrap_sportevolve_account', { p_display_name: null });
    if (error) {
      Alert.alert('Profil indisponible', error.message);
      setLoading(false);
      return;
    }

    const loaded = (data ?? []) as AthleteSummary[];
    setAthletes(loaded);
    const saved = localStorage.getItem('sportevolve.activeAthleteId');
    const selected = loaded.find((athlete) => athlete.athlete_id === saved) ?? loaded[0];
    setActiveAthleteId(selected?.athlete_id ?? '');
  }

  async function loadProfile(athleteId: string) {
    setLoading(true);
    const athlete = athletes.find((item) => item.athlete_id === athleteId);
    if (athlete) {
      setHeightCm(athlete.height_cm == null ? '' : String(athlete.height_cm));
      setBirthDate(athlete.birth_date ?? '');
      setSex(athlete.sex);
    }

    const [weightResult, nutritionResult] = await Promise.all([
      supabase
        .from('body_measurements')
        .select('value')
        .eq('athlete_id', athleteId)
        .eq('metric_type', 'weight')
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('nutrition_profiles')
        .select('goal')
        .eq('athlete_id', athleteId)
        .maybeSingle(),
    ]);

    const currentWeight = weightResult.data?.value == null ? null : Number(weightResult.data.value);
    setLatestWeight(currentWeight);
    setWeightKg(currentWeight == null ? '' : String(currentWeight));
    setGoal((nutritionResult.data?.goal as Goal | undefined) ?? 'maintenance');
    setLoading(false);
  }

  function selectAthlete(athleteId: string) {
    localStorage.setItem('sportevolve.activeAthleteId', athleteId);
    setActiveAthleteId(athleteId);
  }

  async function save() {
    if (!activeAthleteId || saving) return;
    const parsedHeight = parsePositive(heightCm);
    const parsedWeight = parsePositive(weightKg);

    if (birthDate && Number.isNaN(new Date(`${birthDate}T12:00:00`).getTime())) {
      Alert.alert('Date incorrecte', 'Utilise le format AAAA-MM-JJ.');
      return;
    }
    if (heightCm.trim() && parsedHeight == null) {
      Alert.alert('Taille incorrecte', 'Renseigne une taille en centimètres.');
      return;
    }
    if (weightKg.trim() && parsedWeight == null) {
      Alert.alert('Poids incorrect', 'Renseigne un poids en kilogrammes.');
      return;
    }

    setSaving(true);

    const { error: athleteError } = await supabase
      .from('athletes')
      .update({
        sex,
        birth_date: birthDate || null,
        height_cm: parsedHeight,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activeAthleteId);

    if (athleteError) {
      Alert.alert('Enregistrement impossible', athleteError.message);
      setSaving(false);
      return;
    }

    const { error: nutritionError } = await supabase.from('nutrition_profiles').upsert({
      athlete_id: activeAthleteId,
      goal,
      bmr_formula: 'mifflin_st_jeor',
      protein_g_per_kg: 1.8,
      fat_g_per_kg_floor: 0.8,
      baseline_activity_level: 'moderate',
      config: {},
      updated_at: new Date().toISOString(),
    });

    if (nutritionError) {
      Alert.alert('Profil nutrition non enregistré', nutritionError.message);
      setSaving(false);
      return;
    }

    if (parsedWeight != null && (latestWeight == null || Math.abs(parsedWeight - latestWeight) > 0.01)) {
      const { error: weightError } = await supabase.from('body_measurements').insert({
        athlete_id: activeAthleteId,
        metric_type: 'weight',
        value: parsedWeight,
        unit: 'kg',
        measured_at: new Date().toISOString(),
        source_type: 'manual',
        metadata: { app_version: 'v1' },
      });

      if (weightError) {
        Alert.alert('Poids non enregistré', weightError.message);
        setSaving(false);
        return;
      }
      setLatestWeight(parsedWeight);
    }

    setAthletes((current) => current.map((athlete) => (
      athlete.athlete_id === activeAthleteId
        ? { ...athlete, sex, height_cm: parsedHeight, birth_date: birthDate || null }
        : athlete
    )));
    setSaving(false);
    Alert.alert('Profil enregistré ✓', 'Ces données alimenteront la progression et le moteur nutritionnel.');
  }

  const active = athletes.find((athlete) => athlete.athlete_id === activeAthleteId);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>ATHLÈTE</Text>
            <Text style={styles.title}>Profil</Text>
          </View>
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
          <View style={styles.center}><ActivityIndicator color="#b7d400" size="large" /><Text style={styles.muted}>Chargement du profil…</Text></View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{active?.display_name?.slice(0, 1).toUpperCase() ?? '?'}</Text></View>
              <View style={styles.flex}>
                <Text style={styles.heroName}>{active?.display_name ?? 'Athlète'}</Text>
                <Text style={styles.heroText}>Historique long terme, nutrition et contexte sportif.</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Identité sportive</Text>
              <Text style={styles.label}>SEXE</Text>
              <View style={styles.row}>
                <Choice label="Homme" selected={sex === 'male'} onPress={() => setSex('male')} />
                <Choice label="Femme" selected={sex === 'female'} onPress={() => setSex('female')} />
              </View>

              <View style={styles.twoCols}>
                <View style={styles.col}>
                  <Text style={[styles.label, styles.mt16]}>TAILLE · CM</Text>
                  <TextInput value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" placeholder="186" placeholderTextColor="#53606a" style={styles.input} />
                </View>
                <View style={styles.col}>
                  <Text style={[styles.label, styles.mt16]}>POIDS · KG</Text>
                  <TextInput value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" placeholder="85" placeholderTextColor="#53606a" style={styles.input} />
                </View>
              </View>

              <Text style={[styles.label, styles.mt16]}>DATE DE NAISSANCE</Text>
              <TextInput value={birthDate} onChangeText={setBirthDate} placeholder="AAAA-MM-JJ" placeholderTextColor="#53606a" autoCapitalize="none" style={styles.input} />
              <Text style={styles.help}>Le poids est historisé : une nouvelle valeur crée une nouvelle mesure au lieu d’écraser l’ancienne.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Objectif nutritionnel</Text>
              <Text style={styles.cardText}>SportEvolve adaptera les cibles calories/macros au profil et à l’entraînement. Ce n’est pas un journal alimentaire.</Text>
              <View style={styles.goalGrid}>
                {GOALS.map(([value, label]) => (
                  <Choice key={value} label={label} selected={goal === value} onPress={() => setGoal(value)} />
                ))}
              </View>
            </View>

            <Pressable disabled={saving} onPress={() => void save()} style={[styles.saveButton, saving && styles.disabled]}>
              {saving ? <ActivityIndicator color="#0c1009" /> : <Text style={styles.saveText}>Enregistrer le profil</Text>}
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceActive]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function parsePositive(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#090b0f' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 14 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#273039', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#dce2e6', fontSize: 22, fontWeight: '800' },
  eyebrow: { color: '#9ab300', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#f3f6f8', fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 2 },
  switchRow: { flexDirection: 'row', gap: 7, paddingHorizontal: 18, paddingBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: '#29323a', backgroundColor: '#10151a' },
  chipActive: { backgroundColor: '#202817', borderColor: '#526327' },
  chipText: { color: '#75818b', fontSize: 10, fontWeight: '900' },
  chipTextActive: { color: '#d7e888' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#7f8a95', fontSize: 11, fontWeight: '700' },
  content: { padding: 18, paddingTop: 8, paddingBottom: 50 },
  heroCard: { flexDirection: 'row', gap: 13, alignItems: 'center', padding: 16, borderRadius: 19, backgroundColor: '#141c15', borderWidth: 1, borderColor: '#3a4727', marginBottom: 15 },
  avatar: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#b7d400', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#0c1009', fontSize: 23, fontWeight: '900' },
  heroName: { color: '#eff3f5', fontSize: 18, fontWeight: '900' },
  heroText: { color: '#78858c', fontSize: 9, lineHeight: 14, marginTop: 4 },
  card: { padding: 16, borderRadius: 19, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#252e36', marginBottom: 14 },
  sectionTitle: { color: '#eef2f4', fontSize: 16, fontWeight: '900', marginBottom: 14 },
  label: { color: '#7f8a95', fontSize: 8, fontWeight: '900', letterSpacing: 0.9, marginBottom: 7 },
  row: { flexDirection: 'row', gap: 7 },
  twoCols: { flexDirection: 'row', gap: 9 },
  col: { flex: 1 },
  mt16: { marginTop: 16 },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: '#303a43', backgroundColor: '#0b1014', color: '#f1f4f6', paddingHorizontal: 13, fontSize: 13 },
  help: { color: '#67737d', fontSize: 8, lineHeight: 13, marginTop: 8 },
  cardText: { color: '#77838d', fontSize: 9, lineHeight: 14, marginBottom: 12 },
  choice: { minHeight: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#0b1014', borderWidth: 1, borderColor: '#2d3740', alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  choiceActive: { backgroundColor: '#202817', borderColor: '#526327' },
  choiceText: { color: '#77838d', fontSize: 9, fontWeight: '900' },
  choiceTextActive: { color: '#d7e888' },
  goalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  saveButton: { minHeight: 54, borderRadius: 17, backgroundColor: '#b7d400', alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#0c1009', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.55 },
});
