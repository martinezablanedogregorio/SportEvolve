import { supabase } from '@/lib/supabase';

export type AthleteSummary = {
  athlete_id: string;
  display_name: string;
  sex: string;
  height_cm: number | null;
  birth_date: string | null;
};

export type Movement = {
  id: string;
  slug: string;
  name: string;
  discipline: string;
  primary_metric: string | null;
  machine_identity_required: boolean;
};

export type DraftSet = {
  localId: string;
  athleteId: string;
  reps: string;
  loadKg: string;
  distanceM: string;
  durationSeconds: string;
  calories: string;
  rpe: string;
  isWarmup: boolean;
  isMaxTest: boolean;
};

export type DraftExercise = {
  localId: string;
  movement: Movement | null;
  notes: string;
  machineIdentity: string;
  sets: DraftSet[];
};

export type SessionDraft = {
  title: string;
  sessionType: string;
  startedAt: string;
  durationMinutes: string;
  rpe: string;
  notes: string;
  participantIds: string[];
  exercises: DraftExercise[];
};

export type SavedSession = {
  id: string;
};

const REFERENCE_DISCIPLINES = new Set(['strength', 'weightlifting', 'machine']);

function numberOrNull(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasSetData(set: DraftSet) {
  return [set.reps, set.loadKg, set.distanceM, set.durationSeconds, set.calories, set.rpe].some((value) => value.trim().length > 0);
}

function roundHalf(value: number) {
  return Math.round(value * 2) / 2;
}

async function cleanupPartialSession(sessionId: string, exerciseIds: string[]) {
  try {
    if (exerciseIds.length > 0) {
      await supabase.from('exercise_sets').delete().in('session_exercise_id', exerciseIds);
    }
    await supabase.from('session_exercises').delete().eq('session_id', sessionId);
    await supabase.from('session_participants').delete().eq('session_id', sessionId);
    await supabase.from('sessions').delete().eq('id', sessionId);
  } catch (error) {
    console.warn('SportEvolve cleanup failed', error);
  }
}

async function bestReferenceValue(
  athleteId: string,
  movementId: string,
  recordKind: 'set_reference' | 'estimated' | 'actual_pr',
  metricType: string,
  machineIdentity?: string
) {
  let query = supabase
    .from('performance_entries')
    .select('value')
    .eq('athlete_id', athleteId)
    .eq('movement_id', movementId)
    .eq('record_kind', recordKind)
    .eq('metric_type', metricType)
    .not('value', 'is', null)
    .order('value', { ascending: false })
    .limit(1);

  if (machineIdentity) {
    query = query.eq('machine_identity', machineIdentity);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.warn('SportEvolve reference lookup', error.message);
    return null;
  }
  return data?.value == null ? null : Number(data.value);
}

async function insertPerformanceIfBetter(args: {
  athleteId: string;
  movement: Movement;
  sessionId: string;
  performedAt: string;
  recordKind: 'set_reference' | 'estimated' | 'actual_pr';
  metricType: string;
  value: number;
  unit: string;
  loadKg: number;
  reps: number;
  estimateFormula?: string | null;
  machineIdentity?: string;
}) {
  const previous = await bestReferenceValue(
    args.athleteId,
    args.movement.id,
    args.recordKind,
    args.metricType,
    args.machineIdentity
  );

  if (previous != null && previous >= args.value) return;

  const { error } = await supabase.from('performance_entries').insert({
    athlete_id: args.athleteId,
    movement_id: args.movement.id,
    session_id: args.sessionId,
    record_kind: args.recordKind,
    metric_type: args.metricType,
    value: args.value,
    unit: args.unit,
    load_kg: args.loadKg,
    reps: args.reps,
    estimate_formula: args.estimateFormula ?? null,
    machine_identity: args.machineIdentity || null,
    performed_at: args.performedAt,
    metadata: { auto_detected: true, source: 'exercise_set' },
  });

  if (error) console.warn('SportEvolve performance insert', error.message);
}

async function updateReferencesFromSet(args: {
  set: DraftSet;
  movement: Movement;
  machineIdentity: string;
  sessionId: string;
  performedAt: string;
}) {
  const { set, movement, machineIdentity, sessionId, performedAt } = args;
  if (!REFERENCE_DISCIPLINES.has(movement.discipline) || set.isWarmup) return;

  const reps = numberOrNull(set.reps);
  const loadKg = numberOrNull(set.loadKg);
  if (reps == null || loadKg == null || reps < 1 || loadKg <= 0) return;

  if (movement.machine_identity_required && !machineIdentity.trim()) return;
  const machine = movement.machine_identity_required ? machineIdentity.trim() : undefined;

  if (reps <= 20) {
    await insertPerformanceIfBetter({
      athleteId: set.athleteId,
      movement,
      sessionId,
      performedAt,
      recordKind: 'set_reference',
      metricType: `best_set_${reps}_reps`,
      value: loadKg,
      unit: 'kg',
      loadKg,
      reps,
      machineIdentity: machine,
    });
  }

  if (movement.discipline !== 'machine' && reps >= 2 && reps <= 12) {
    const e1rm = roundHalf(loadKg * (1 + reps / 30));
    await insertPerformanceIfBetter({
      athleteId: set.athleteId,
      movement,
      sessionId,
      performedAt,
      recordKind: 'estimated',
      metricType: 'e1rm_epley',
      value: e1rm,
      unit: 'kg',
      loadKg,
      reps,
      estimateFormula: 'epley',
    });
  }

  if (movement.discipline !== 'machine' && reps === 1 && set.isMaxTest) {
    await insertPerformanceIfBetter({
      athleteId: set.athleteId,
      movement,
      sessionId,
      performedAt,
      recordKind: 'actual_pr',
      metricType: '1rm',
      value: loadKg,
      unit: 'kg',
      loadKg,
      reps,
    });
  }
}

export async function saveSessionDraft(draft: SessionDraft, userId: string): Promise<SavedSession> {
  if (draft.participantIds.length === 0) throw new Error('Choisis au moins un athlète.');
  const validExercises = draft.exercises.filter((exercise) => exercise.movement && exercise.sets.some(hasSetData));
  if (validExercises.length === 0) throw new Error('Ajoute au moins un exercice avec une série renseignée.');

  const durationMinutes = numberOrNull(draft.durationMinutes);
  const rpe = numberOrNull(draft.rpe);
  const title = draft.title.trim() || 'Séance';

  const { data: created, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      created_by: userId,
      title,
      session_type: draft.sessionType,
      started_at: draft.startedAt,
      duration_minutes: durationMinutes == null ? null : Math.round(durationMinutes),
      rpe,
      notes: draft.notes.trim() || null,
      source_type: 'manual',
      shared: draft.participantIds.length > 1,
      metadata: { app_version: 'v1', input_mode: 'manual' },
    })
    .select('id')
    .single();

  if (sessionError || !created) throw new Error(sessionError?.message ?? 'Impossible de créer la séance.');

  const sessionId = created.id as string;
  const createdExerciseIds: string[] = [];

  try {
    const { error: participantError } = await supabase.from('session_participants').insert(
      draft.participantIds.map((athleteId) => ({ session_id: sessionId, athlete_id: athleteId }))
    );
    if (participantError) throw participantError;

    for (let exerciseIndex = 0; exerciseIndex < validExercises.length; exerciseIndex += 1) {
      const exercise = validExercises[exerciseIndex];
      const movement = exercise.movement!;

      const { data: createdExercise, error: exerciseError } = await supabase
        .from('session_exercises')
        .insert({
          session_id: sessionId,
          movement_id: movement.id,
          exercise_order: exerciseIndex,
          notes: exercise.notes.trim() || null,
          metadata: exercise.machineIdentity.trim() ? { machine_identity: exercise.machineIdentity.trim() } : {},
        })
        .select('id')
        .single();
      if (exerciseError || !createdExercise) throw exerciseError ?? new Error('Exercice non créé.');

      const sessionExerciseId = createdExercise.id as string;
      createdExerciseIds.push(sessionExerciseId);

      const sets = exercise.sets.filter(hasSetData);
      const setRows = sets.map((set, index) => ({
        session_exercise_id: sessionExerciseId,
        athlete_id: set.athleteId,
        set_order: index,
        reps: numberOrNull(set.reps),
        load_kg: numberOrNull(set.loadKg),
        distance_m: numberOrNull(set.distanceM),
        duration_seconds: numberOrNull(set.durationSeconds),
        calories: numberOrNull(set.calories),
        rpe: numberOrNull(set.rpe),
        is_warmup: set.isWarmup,
        is_max_test: set.isMaxTest,
        metadata: exercise.machineIdentity.trim() ? { machine_identity: exercise.machineIdentity.trim() } : {},
      }));

      const { error: setsError } = await supabase.from('exercise_sets').insert(setRows);
      if (setsError) throw setsError;
    }
  } catch (error) {
    await cleanupPartialSession(sessionId, createdExerciseIds);
    throw error instanceof Error ? error : new Error('La séance n’a pas pu être enregistrée.');
  }

  for (const exercise of validExercises) {
    const movement = exercise.movement!;
    for (const set of exercise.sets.filter(hasSetData)) {
      try {
        await updateReferencesFromSet({
          set,
          movement,
          machineIdentity: exercise.machineIdentity,
          sessionId,
          performedAt: draft.startedAt,
        });
      } catch (error) {
        console.warn('SportEvolve reference derivation failed', error);
      }
    }
  }

  return { id: sessionId };
}
