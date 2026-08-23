import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import {
  type AthleteSummary,
  type DraftExercise,
  type DraftSet,
  type Movement,
  saveSessionDraft,
} from '@/lib/sessionRepository';

const SESSION_TYPES = [
  ['cross_training', 'Cross training'],
  ['strength', 'Force'],
  ['weightlifting', 'Haltéro'],
  ['gymnastics', 'Gym'],
  ['running', 'Running'],
  ['erg', 'Erg'],
  ['hyrox', 'Hyrox'],
  ['mobility', 'Mobilité'],
  ['other', 'Autre'],
] as const;

function localId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localDateParts() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function emptySet(athleteId: string): DraftSet {
  return {
    localId: localId(),
    athleteId,
    reps: '',
    loadKg: '',
    distanceM: '',
    durationSeconds: '',
    calories: '',
    rpe: '',
    isWarmup: false,
    isMaxTest: false,
  };
}

function emptyExercise(athleteId: string): DraftExercise {
  return {
    localId: localId(),
    movement: null,
    notes: '',
    machineIdentity: '',
    sets: [emptySet(athleteId)],
  };
}

export default function AddSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ athleteId?: string }>();
  const initialDate = useMemo(() => localDateParts(), []);

  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [singleAthleteId, setSingleAthleteId] = useState(params.athleteId ?? '');
  const [shared, setShared] = useState(false);
  const [title, setTitle] = useState('');
  const [sessionType, setSessionType] = useState('cross_training');
  const [dateText, setDateText] = useState(initialDate.date);
  const [timeText, setTimeText] = useState(initialDate.time);
  const [durationMinutes, setDurationMinutes] = useState('');
  const [sessionRpe, setSessionRpe] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerExerciseId, setPickerExerciseId] = useState<string | null>(null);
  const [movementSearch, setMovementSearch] = useState('');

  useEffect(() => {
    void loadFoundation();
  }, []);

  const visibleAthletes = athletes.slice(0, 2);
  const participantIds = useMemo(() => {
    if (shared) return visibleAthletes.map((item) => item.athlete_id);
    const chosen = singleAthleteId || visibleAthletes[0]?.athlete_id;
    return chosen ? [chosen] : [];
  }, [shared, singleAthleteId, visibleAthletes]);

  const filteredMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    const source = q
      ? movements.filter((movement) => `${movement.name} ${movement.discipline}`.toLowerCase().includes(q))
      : movements;
    return source.slice(0, 30);
  }, [movementSearch, movements]);

  async function loadFoundation() {
    setLoading(true);
    const [{ data: accountData, error: accountError }, { data: movementData, error: movementError }] = await Promise.all([
      supabase.rpc('bootstrap_sportevolve_account', { p_display_name: null }),
      supabase
        .from('movements')
        .select('id, slug, name, discipline, primary_metric, machine_identity_required')
        .eq('is_system', true)
        .order('discipline')
        .order('name'),
    ]);

    if (accountError || movementError) {
      Alert.alert('Chargement impossible', accountError?.message ?? movementError?.message ?? 'Erreur inconnue');
      setLoading(false);
      return;
    }

    const loadedAthletes = (accountData ?? []) as AthleteSummary[];
    setAthletes(loadedAthletes);
    setMovements((movementData ?? []) as Movement[]);

    const preferred = params.athleteId || localStorage.getItem('sportevolve.activeAthleteId') || loadedAthletes[0]?.athlete_id || '';
    setSingleAthleteId(preferred);
    setExercises([emptyExercise(preferred)]);
    setLoading(false);
  }

  function updateExercise(exerciseId: string, patch: Partial<DraftExercise>) {
    setExercises((current) => current.map((exercise) => (exercise.localId === exerciseId ? { ...exercise, ...patch } : exercise)));
  }

  function updateSet(exerciseId: string, setId: string, patch: Partial<DraftSet>) {
    setExercises((current) => current.map((exercise) => {
      if (exercise.localId !== exerciseId) return exercise;
      return {
        ...exercise,
        sets: exercise.sets.map((set) => (set.localId === setId ? { ...set, ...patch } : set)),
      };
    }));
  }

  function addExercise() {
    const athleteId = participantIds[0] || singleAthleteId;
    setExercises((current) => [...current, emptyExercise(athleteId)]);
  }

  function removeExercise(exerciseId: string) {
    setExercises((current) => current.filter((exercise) => exercise.localId !== exerciseId));
  }

  function addSet(exerciseId: string) {
    setExercises((current) => current.map((exercise) => {
      if (exercise.localId !== exerciseId) return exercise;
      const previous = exercise.sets[exercise.sets.length - 1];
      const athleteId = previous?.athleteId && participantIds.includes(previous.athleteId) ? previous.athleteId : participantIds[0];
      const next = previous
        ? { ...previous, localId: localId(), isMaxTest: false }
        : emptySet(athleteId);
      return { ...exercise, sets: [...exercise.sets, next] };
    }));
  }

  function removeSet(exerciseId: string, setId: string) {
    setExercises((current) => current.map((exercise) => {
      if (exercise.localId !== exerciseId) return exercise;
      const remaining = exercise.sets.filter((set) => set.localId !== setId);
      return { ...exercise, sets: remaining.length ? remaining : [emptySet(participantIds[0] ?? singleAthleteId)] };
    }));
  }

  function chooseMovement(movement: Movement) {
    if (!pickerExerciseId) return;
    updateExercise(pickerExerciseId, { movement, machineIdentity: '' });
    setPickerExerciseId(null);
    setMovementSearch('');
  }

  async function save() {
    if (saving) return;
    if (!participantIds.length) {
      Alert.alert('Athlète manquant', 'Choisis Gregorio, Morgane ou une séance partagée.');
      return;
    }

    const startedAt = new Date(`${dateText}T${timeText || '12:00'}:00`);
    if (Number.isNaN(startedAt.getTime())) {
      Alert.alert('Date incorrecte', 'Utilise le format AAAA-MM-JJ et HH:MM.');
      return;
    }

    const normalizedExercises = exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        athleteId: participantIds.includes(set.athleteId) ? set.athleteId : participantIds[0],
      })),
    }));

    const missingMovement = normalizedExercises.some((exercise) => exercise.sets.some((set) => hasAnySetValue(set)) && !exercise.movement);
    if (missingMovement) {
      Alert.alert('Mouvement manquant', 'Choisis un mouvement pour chaque exercice renseigné.');
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user.id;
      if (!userId) throw new Error('Session utilisateur expirée.');

      await saveSessionDraft({
        title,
        sessionType,
        startedAt: startedAt.toISOString(),
        durationMinutes,
        rpe: sessionRpe,
        notes,
        participantIds,
        exercises: normalizedExercises,
      }, userId);

      localStorage.setItem('sportevolve.activeAthleteId', participantIds[0]);
      Alert.alert('Séance enregistrée ✓', 'Les séries sont dans Supabase et les nouvelles références ont été calculées.', [
        { text: 'Voir les sessions', onPress: () => router.replace('/sessions') },
      ]);
    } catch (error) {
      Alert.alert('Enregistrement impossible', error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color="#b7d400" size="large" />
        <Text style={styles.muted}>Préparation de la séance…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>←</Text></Pressable>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>+ AJOUTER</Text>
              <Text style={styles.title}>Nouvelle séance</Text>
            </View>
          </View>

          <Text style={styles.label}>ATHLÈTE</Text>
          <View style={styles.segmentRow}>
            {visibleAthletes.map((athlete) => {
              const selected = !shared && athlete.athlete_id === singleAthleteId;
              return (
                <Pressable
                  key={athlete.athlete_id}
                  onPress={() => { setShared(false); setSingleAthleteId(athlete.athlete_id); }}
                  style={[styles.segment, selected && styles.segmentActive]}
                >
                  <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{athlete.display_name}</Text>
                </Pressable>
              );
            })}
            {visibleAthletes.length > 1 ? (
              <Pressable onPress={() => setShared(true)} style={[styles.segment, shared && styles.segmentActive]}>
                <Text style={[styles.segmentText, shared && styles.segmentTextActive]}>Duo</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>TITRE</Text>
            <TextInput value={title} onChangeText={setTitle} placeholder="Ex. Force + metcon" placeholderTextColor="#53606a" style={styles.input} />

            <Text style={[styles.label, styles.mt16]}>TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
              {SESSION_TYPES.map(([value, label]) => (
                <Pressable key={value} onPress={() => setSessionType(value)} style={[styles.typeChip, sessionType === value && styles.typeChipActive]}>
                  <Text style={[styles.typeText, sessionType === value && styles.typeTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.twoCols}>
              <View style={styles.col}>
                <Text style={[styles.label, styles.mt16]}>DATE</Text>
                <TextInput value={dateText} onChangeText={setDateText} placeholder="2026-08-23" placeholderTextColor="#53606a" autoCapitalize="none" style={styles.input} />
              </View>
              <View style={styles.col}>
                <Text style={[styles.label, styles.mt16]}>HEURE</Text>
                <TextInput value={timeText} onChangeText={setTimeText} placeholder="17:30" placeholderTextColor="#53606a" autoCapitalize="none" style={styles.input} />
              </View>
            </View>

            <View style={styles.twoCols}>
              <View style={styles.col}>
                <Text style={[styles.label, styles.mt16]}>DURÉE · MIN</Text>
                <TextInput value={durationMinutes} onChangeText={setDurationMinutes} keyboardType="decimal-pad" placeholder="60" placeholderTextColor="#53606a" style={styles.input} />
              </View>
              <View style={styles.col}>
                <Text style={[styles.label, styles.mt16]}>RPE · /10</Text>
                <TextInput value={sessionRpe} onChangeText={setSessionRpe} keyboardType="decimal-pad" placeholder="8" placeholderTextColor="#53606a" style={styles.input} />
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.eyebrow}>CONTENU</Text>
              <Text style={styles.sectionTitle}>Exercices & séries</Text>
            </View>
            <Pressable onPress={addExercise} style={styles.smallAction}><Text style={styles.smallActionText}>+ Exercice</Text></Pressable>
          </View>

          {exercises.map((exercise, exerciseIndex) => (
            <ExerciseCard
              key={exercise.localId}
              exercise={exercise}
              index={exerciseIndex}
              participants={visibleAthletes.filter((athlete) => participantIds.includes(athlete.athlete_id))}
              shared={shared}
              onPickMovement={() => setPickerExerciseId(exercise.localId)}
              onUpdate={(patch) => updateExercise(exercise.localId, patch)}
              onUpdateSet={(setId, patch) => updateSet(exercise.localId, setId, patch)}
              onAddSet={() => addSet(exercise.localId)}
              onRemoveSet={(setId) => removeSet(exercise.localId, setId)}
              onRemove={() => removeExercise(exercise.localId)}
            />
          ))}

          <View style={styles.card}>
            <Text style={styles.label}>NOTES DE SÉANCE</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Sensations, contexte, adaptation du coach…"
              placeholderTextColor="#53606a"
              multiline
              style={[styles.input, styles.textArea]}
            />
          </View>

          <Pressable disabled={saving} onPress={() => void save()} style={[styles.saveButton, saving && styles.disabled]}>
            {saving ? <ActivityIndicator color="#0c1009" /> : <Text style={styles.saveText}>Enregistrer la séance</Text>}
          </Pressable>
          <Text style={styles.footnote}>Une série de 1 rep n’est jamais considérée comme un vrai 1RM sauf si tu coches explicitement « Test 1RM ».</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={pickerExerciseId != null} animationType="slide" transparent onRequestClose={() => setPickerExerciseId(null)}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.eyebrow}>MOUVEMENT</Text>
                <Text style={styles.modalTitle}>Choisir un exercice</Text>
              </View>
              <Pressable onPress={() => setPickerExerciseId(null)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
            </View>
            <TextInput
              autoFocus
              value={movementSearch}
              onChangeText={setMovementSearch}
              placeholder="Rechercher Bench, Run, Wall Ball…"
              placeholderTextColor="#53606a"
              style={styles.searchInput}
            />
            <ScrollView keyboardShouldPersistTaps="handled">
              {filteredMovements.map((movement) => (
                <Pressable key={movement.id} onPress={() => chooseMovement(movement)} style={styles.movementRow}>
                  <View>
                    <Text style={styles.movementName}>{movement.name}</Text>
                    <Text style={styles.movementDiscipline}>{disciplineLabel(movement.discipline)}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ExerciseCard(props: {
  exercise: DraftExercise;
  index: number;
  participants: AthleteSummary[];
  shared: boolean;
  onPickMovement: () => void;
  onUpdate: (patch: Partial<DraftExercise>) => void;
  onUpdateSet: (setId: string, patch: Partial<DraftSet>) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onRemove: () => void;
}) {
  const { exercise, index, participants, shared } = props;
  const metric = exercise.movement?.primary_metric ?? '';
  const showLoad = ['load_reps', 'reps_load', 'distance_load'].includes(metric) || exercise.movement?.discipline === 'strength' || exercise.movement?.discipline === 'weightlifting' || exercise.movement?.discipline === 'machine';
  const showReps = ['load_reps', 'reps', 'reps_load'].includes(metric) || !exercise.movement;
  const showDistance = ['distance_time', 'distance_load'].includes(metric);
  const showDuration = ['distance_time', 'calories_time'].includes(metric);
  const showCalories = metric === 'calories_time';

  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseTop}>
        <Text style={styles.exerciseNumber}>EXERCICE {index + 1}</Text>
        <Pressable onPress={props.onRemove}><Text style={styles.removeText}>Supprimer</Text></Pressable>
      </View>

      <Pressable onPress={props.onPickMovement} style={styles.movementPicker}>
        <View>
          <Text style={exercise.movement ? styles.movementSelected : styles.movementPlaceholder}>
            {exercise.movement?.name ?? 'Choisir un mouvement'}
          </Text>
          {exercise.movement ? <Text style={styles.movementDiscipline}>{disciplineLabel(exercise.movement.discipline)}</Text> : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      {exercise.movement?.machine_identity_required ? (
        <View style={styles.machineBox}>
          <Text style={styles.label}>MACHINE / MODÈLE</Text>
          <TextInput
            value={exercise.machineIdentity}
            onChangeText={(machineIdentity) => props.onUpdate({ machineIdentity })}
            placeholder="Ex. Technogym Leg Press"
            placeholderTextColor="#53606a"
            style={styles.input}
          />
          <Text style={styles.miniHelp}>Requis pour comparer proprement les références machine.</Text>
        </View>
      ) : null}

      {exercise.sets.map((set, setIndex) => (
        <View key={set.localId} style={styles.setBox}>
          <View style={styles.setHeader}>
            <Text style={styles.setTitle}>Série {setIndex + 1}</Text>
            <Pressable onPress={() => props.onRemoveSet(set.localId)}><Text style={styles.setRemove}>×</Text></Pressable>
          </View>

          {shared && participants.length > 1 ? (
            <View style={styles.athleteMiniRow}>
              {participants.map((athlete) => {
                const selected = set.athleteId === athlete.athlete_id;
                return (
                  <Pressable key={athlete.athlete_id} onPress={() => props.onUpdateSet(set.localId, { athleteId: athlete.athlete_id })} style={[styles.athleteMini, selected && styles.athleteMiniActive]}>
                    <Text style={[styles.athleteMiniText, selected && styles.athleteMiniTextActive]}>{athlete.display_name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.metricGrid}>
            {showLoad ? <MetricInput label="KG" value={set.loadKg} onChange={(loadKg) => props.onUpdateSet(set.localId, { loadKg })} /> : null}
            {showReps ? <MetricInput label="REPS" value={set.reps} onChange={(reps) => props.onUpdateSet(set.localId, { reps, isMaxTest: reps.trim() === '1' ? set.isMaxTest : false })} /> : null}
            {showDistance ? <MetricInput label="MÈTRES" value={set.distanceM} onChange={(distanceM) => props.onUpdateSet(set.localId, { distanceM })} /> : null}
            {showDuration ? <MetricInput label="SECONDES" value={set.durationSeconds} onChange={(durationSeconds) => props.onUpdateSet(set.localId, { durationSeconds })} /> : null}
            {showCalories ? <MetricInput label="CAL" value={set.calories} onChange={(calories) => props.onUpdateSet(set.localId, { calories })} /> : null}
            <MetricInput label="RPE" value={set.rpe} onChange={(rpe) => props.onUpdateSet(set.localId, { rpe })} />
          </View>

          <View style={styles.flagsRow}>
            <Pressable onPress={() => props.onUpdateSet(set.localId, { isWarmup: !set.isWarmup })} style={[styles.flag, set.isWarmup && styles.flagActive]}>
              <Text style={[styles.flagText, set.isWarmup && styles.flagTextActive]}>Échauffement</Text>
            </Pressable>
            {set.reps.trim() === '1' && exercise.movement?.discipline !== 'machine' ? (
              <Pressable onPress={() => props.onUpdateSet(set.localId, { isMaxTest: !set.isMaxTest })} style={[styles.flag, set.isMaxTest && styles.maxFlagActive]}>
                <Text style={[styles.flagText, set.isMaxTest && styles.maxFlagText]}>Test 1RM</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}

      <Pressable onPress={props.onAddSet} style={styles.addSetButton}><Text style={styles.addSetText}>+ Ajouter une série</Text></Pressable>

      <TextInput
        value={exercise.notes}
        onChangeText={(notes) => props.onUpdate({ notes })}
        placeholder="Note exercice (optionnel)"
        placeholderTextColor="#53606a"
        style={[styles.input, styles.exerciseNote]}
      />
    </View>
  );
}

function MetricInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.metricInputWrap}>
      <Text style={styles.metricLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="—" placeholderTextColor="#4f5a64" style={styles.metricInput} />
    </View>
  );
}

function hasAnySetValue(set: DraftSet) {
  return [set.reps, set.loadKg, set.distanceM, set.durationSeconds, set.calories, set.rpe].some((value) => value.trim());
}

function disciplineLabel(value: string) {
  const labels: Record<string, string> = {
    strength: 'Force',
    weightlifting: 'Haltérophilie',
    gymnastics: 'Gymnastique',
    running: 'Running',
    erg: 'Erg',
    machine: 'Machine',
    functional: 'Fonctionnel',
    other: 'Autre',
  };
  return labels[value] ?? value;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#090b0f' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: '#7f8a95', fontSize: 11, fontWeight: '700' },
  content: { padding: 18, paddingBottom: 50 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#273039', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#dce2e6', fontSize: 22, fontWeight: '800' },
  eyebrow: { color: '#9ab300', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#f3f6f8', fontSize: 28, fontWeight: '900', letterSpacing: -1, marginTop: 3 },
  label: { color: '#7f8a95', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 7 },
  mt16: { marginTop: 16 },
  segmentRow: { flexDirection: 'row', gap: 7, marginBottom: 18 },
  segment: { paddingHorizontal: 15, minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#29323a', backgroundColor: '#10151a', alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: '#202817', borderColor: '#526327' },
  segmentText: { color: '#7a8690', fontSize: 11, fontWeight: '900' },
  segmentTextActive: { color: '#d7e888' },
  card: { padding: 16, borderRadius: 19, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#252e36', marginBottom: 22 },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: '#303a43', backgroundColor: '#0b1014', color: '#f1f4f6', paddingHorizontal: 13, fontSize: 13 },
  textArea: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' },
  twoCols: { flexDirection: 'row', gap: 9 },
  col: { flex: 1 },
  typeRow: { gap: 7, paddingRight: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#0b1014', borderWidth: 1, borderColor: '#29323a' },
  typeChipActive: { backgroundColor: '#202817', borderColor: '#526327' },
  typeText: { color: '#77838d', fontSize: 9, fontWeight: '800' },
  typeTextActive: { color: '#d7e888' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { color: '#edf1f3', fontSize: 18, fontWeight: '900', marginTop: 3 },
  smallAction: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#151d12', borderWidth: 1, borderColor: '#405020' },
  smallActionText: { color: '#c4db55', fontSize: 9, fontWeight: '900' },
  exerciseCard: { padding: 15, borderRadius: 19, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#29323a', marginBottom: 13 },
  exerciseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  exerciseNumber: { color: '#73808a', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  removeText: { color: '#a46f78', fontSize: 9, fontWeight: '800' },
  movementPicker: { minHeight: 58, borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#0b1014', borderWidth: 1, borderColor: '#354049', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  movementSelected: { color: '#eef2f4', fontSize: 15, fontWeight: '900' },
  movementPlaceholder: { color: '#687580', fontSize: 14, fontWeight: '800' },
  movementDiscipline: { color: '#77838d', fontSize: 8, fontWeight: '800', marginTop: 3, textTransform: 'uppercase' },
  chevron: { color: '#8d9a55', fontSize: 25, fontWeight: '400' },
  machineBox: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: '#0d1216', borderWidth: 1, borderColor: '#2b343c' },
  miniHelp: { color: '#66727c', fontSize: 8, lineHeight: 12, marginTop: 7 },
  setBox: { marginTop: 12, padding: 12, borderRadius: 15, backgroundColor: '#0b1014', borderWidth: 1, borderColor: '#252e36' },
  setHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 },
  setTitle: { color: '#aeb8bf', fontSize: 9, fontWeight: '900' },
  setRemove: { color: '#7a858e', fontSize: 19, lineHeight: 20 },
  athleteMiniRow: { flexDirection: 'row', gap: 6, marginBottom: 9 },
  athleteMini: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, borderWidth: 1, borderColor: '#29323a' },
  athleteMiniActive: { backgroundColor: '#202817', borderColor: '#526327' },
  athleteMiniText: { color: '#68747e', fontSize: 8, fontWeight: '900' },
  athleteMiniTextActive: { color: '#d7e888' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metricInputWrap: { minWidth: 72, flexGrow: 1, flexBasis: '28%' },
  metricLabel: { color: '#68747e', fontSize: 7, fontWeight: '900', letterSpacing: 0.7, marginBottom: 5 },
  metricInput: { minHeight: 43, borderRadius: 11, borderWidth: 1, borderColor: '#2d3740', backgroundColor: '#090d11', color: '#eef2f4', paddingHorizontal: 11, fontSize: 13, fontWeight: '800' },
  flagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  flag: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#2c353d' },
  flagActive: { backgroundColor: '#1a2228', borderColor: '#53616b' },
  maxFlagActive: { backgroundColor: '#2d2613', borderColor: '#877329' },
  flagText: { color: '#69757f', fontSize: 8, fontWeight: '800' },
  flagTextActive: { color: '#bbc4ca' },
  maxFlagText: { color: '#e4cf69' },
  addSetButton: { marginTop: 10, minHeight: 40, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#39454e', alignItems: 'center', justifyContent: 'center' },
  addSetText: { color: '#89959e', fontSize: 9, fontWeight: '900' },
  exerciseNote: { marginTop: 10, minHeight: 43 },
  saveButton: { minHeight: 55, borderRadius: 17, backgroundColor: '#b7d400', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { color: '#0c1009', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  footnote: { color: '#606c75', fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 10, paddingHorizontal: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet: { height: '78%', backgroundColor: '#0d1115', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#2b343c', padding: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { color: '#f0f3f5', fontSize: 22, fontWeight: '900', marginTop: 3 },
  closeButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#151b20', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#a5afb6', fontSize: 25, lineHeight: 27 },
  searchInput: { minHeight: 49, borderRadius: 14, backgroundColor: '#090d11', borderWidth: 1, borderColor: '#354049', color: '#eef2f4', paddingHorizontal: 14, fontSize: 13, marginBottom: 10 },
  movementRow: { minHeight: 59, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#293139', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 3 },
  movementName: { color: '#dfe5e8', fontSize: 13, fontWeight: '900' },
});
