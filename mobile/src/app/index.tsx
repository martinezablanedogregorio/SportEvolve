import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
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

type Athlete = {
  athlete_id: string;
  display_name: string;
  sex: string;
  height_cm: number | null;
  birth_date: string | null;
};

type NutritionTarget = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  day_type: string;
};

type PlannedSession = {
  title: string;
  session_type: string;
  scheduled_at: string | null;
};

type DashboardData = {
  sessions: number;
  references: number;
  latestWeight: number | null;
  nutrition: NutritionTarget | null;
  nextSession: PlannedSession | null;
};

const EMPTY_DASHBOARD: DashboardData = {
  sessions: 0,
  references: 0,
  latestWeight: null,
  nutrition: null,
  nextSession: null,
};

export default function HomeScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [activeAthleteId, setActiveAthleteId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [loadingData, setLoadingData] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (!nextSession) {
        setAthletes([]);
        setActiveAthleteId(null);
        setDashboard(EMPTY_DASHBOARD);
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void bootstrapAccount(session);
  }, [session?.user.id]);

  useEffect(() => {
    if (!activeAthleteId) return;
    localStorage.setItem('sportevolve.activeAthleteId', activeAthleteId);
    void loadDashboard(activeAthleteId);
  }, [activeAthleteId]);

  async function bootstrapAccount(currentSession: Session) {
    setLoadingData(true);
    setBootstrapError(null);

    const displayName = currentSession.user.email?.split('@')[0] ?? null;
    const { data, error } = await supabase.rpc('bootstrap_sportevolve_account', {
      p_display_name: displayName,
    });

    if (error) {
      setBootstrapError(error.message);
      setLoadingData(false);
      return;
    }

    const loaded = (data ?? []) as Athlete[];
    setAthletes(loaded);

    const saved = localStorage.getItem('sportevolve.activeAthleteId');
    const selected = loaded.find((item) => item.athlete_id === saved) ?? loaded[0] ?? null;
    setActiveAthleteId(selected?.athlete_id ?? null);
    setLoadingData(false);
  }

  async function loadDashboard(athleteId: string) {
    setLoadingData(true);
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    const [sessionsResult, referencesResult, weightResult, nutritionResult, plannedResult] = await Promise.all([
      supabase
        .from('session_participants')
        .select('session_id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId),
      supabase
        .from('performance_entries')
        .select('id', { count: 'exact', head: true })
        .eq('athlete_id', athleteId),
      supabase
        .from('body_measurements')
        .select('value')
        .eq('athlete_id', athleteId)
        .eq('metric_type', 'weight')
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('nutrition_targets')
        .select('calories, protein_g, carbs_g, fat_g, day_type')
        .eq('athlete_id', athleteId)
        .eq('target_date', today)
        .order('calculated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('planned_sessions')
        .select('title, session_type, scheduled_at')
        .eq('athlete_id', athleteId)
        .eq('status', 'planned')
        .gte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const firstError = [sessionsResult.error, referencesResult.error, weightResult.error, nutritionResult.error, plannedResult.error].find(Boolean);
    if (firstError) {
      console.warn('SportEvolve dashboard load:', firstError.message);
    }

    setDashboard({
      sessions: sessionsResult.count ?? 0,
      references: referencesResult.count ?? 0,
      latestWeight: weightResult.data?.value ?? null,
      nutrition: nutritionResult.data ?? null,
      nextSession: plannedResult.data ?? null,
    });
    setLoadingData(false);
  }

  if (!authReady) {
    return <LoadingScreen label="Ouverture de SportEvolve…" />;
  }

  if (!session) {
    return <AuthScreen />;
  }

  const activeAthlete = athletes.find((item) => item.athlete_id === activeAthleteId) ?? athletes[0];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <View>
            <Text style={styles.brand}>SPORT<Text style={styles.brandAccent}>EVOLVE</Text></Text>
            <Text style={styles.version}>V1 · CLOUD CONNECTED</Text>
          </View>
          <Pressable onPress={() => void supabase.auth.signOut()} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sortir</Text>
          </Pressable>
        </View>

        {bootstrapError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Connexion à la mémoire impossible</Text>
            <Text style={styles.errorText}>{bootstrapError}</Text>
            <Pressable onPress={() => session && void bootstrapAccount(session)} style={styles.primarySmall}>
              <Text style={styles.primarySmallText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.profileSwitch}>
          {athletes.slice(0, 2).map((item) => {
            const selected = item.athlete_id === activeAthleteId;
            return (
              <Pressable
                key={item.athlete_id}
                onPress={() => setActiveAthleteId(item.athlete_id)}
                style={[styles.profileChip, selected && styles.profileChipActive]}
              >
                <Text style={[styles.profileChipText, selected && styles.profileChipTextActive]}>{item.display_name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.eyebrow}>TABLEAU DE BORD</Text>
        <Text style={styles.title}>{activeAthlete ? `Bonjour ${activeAthlete.display_name}.` : 'Bienvenue.'}</Text>
        <Text style={styles.subtitle}>Cette fois, les informations viennent de la vraie base SportEvolve.</Text>

        {loadingData && athletes.length === 0 ? <ActivityIndicator color="#b7d400" style={{ marginTop: 24 }} /> : null}

        <View style={styles.statusRow}>
          <Status label="Séances" value={String(dashboard.sessions)} />
          <Status label="Références" value={String(dashboard.references)} />
          <Status label="Poids" value={dashboard.latestWeight ? `${formatNumber(dashboard.latestWeight)} kg` : '—'} />
        </View>

        <Text style={styles.sectionTitle}>Nutrition aujourd’hui</Text>
        <View style={styles.nutritionCard}>
          {dashboard.nutrition ? (
            <>
              <Text style={styles.nutritionMode}>{formatDayType(dashboard.nutrition.day_type)}</Text>
              <Text style={styles.kcal}>{dashboard.nutrition.calories}<Text style={styles.kcalUnit}> kcal</Text></Text>
              <View style={styles.macroRow}>
                <Macro label="Protéines" value={`${dashboard.nutrition.protein_g} g`} />
                <Macro label="Glucides" value={`${dashboard.nutrition.carbs_g} g`} />
                <Macro label="Lipides" value={`${dashboard.nutrition.fat_g} g`} />
              </View>
              <Text style={styles.helper}>Cible calculée et enregistrée dans Supabase pour aujourd’hui.</Text>
            </>
          ) : (
            <>
              <Text style={styles.nutritionMode}>MOTEUR NUTRITION V1</Text>
              <Text style={styles.emptyTitle}>Profil à compléter</Text>
              <Text style={styles.helper}>Il nous manque encore certaines données réelles avant de générer une prescription calories/macros fiable.</Text>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Prochaine séance</Text>
        <View style={styles.card}>
          <Text style={styles.cardTag}>PROGRAMME</Text>
          <Text style={styles.cardTitle}>{dashboard.nextSession?.title ?? 'Aucune séance planifiée'}</Text>
          <Text style={styles.cardText}>
            {dashboard.nextSession
              ? `${dashboard.nextSession.session_type}${dashboard.nextSession.scheduled_at ? ` · ${formatDateTime(dashboard.nextSession.scheduled_at)}` : ''}`
              : 'Quand une séance sera programmée, elle apparaîtra ici automatiquement.'}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Profil sportif</Text>
        <View style={styles.card}>
          <Text style={styles.cardTag}>DONNÉES RÉELLES</Text>
          <Text style={styles.cardTitle}>{activeAthlete?.display_name ?? 'Athlète'}</Text>
          <Text style={styles.cardText}>
            {activeAthlete
              ? `${formatSex(activeAthlete.sex)} · ${activeAthlete.height_cm ? `${formatNumber(activeAthlete.height_cm)} cm` : 'taille à renseigner'} · ${activeAthlete.birth_date ? formatBirthDate(activeAthlete.birth_date) : 'date de naissance à renseigner'}`
              : 'Chargement…'}
          </Text>
        </View>

        <View style={styles.foundation}>
          <Text style={styles.foundationTitle}>{loadingData ? 'Synchronisation…' : 'Mémoire Supabase active ✓'}</Text>
          <Text style={styles.foundationText}>Compte authentifié · profils multi-athlètes · RLS · données persistantes cloud. Un troisième athlète pourra être ajouté plus tard sans modifier la structure.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().includes('@') && password.length >= 6 && !busy, [email, password, busy]);

  async function signIn() {
    if (!canSubmit) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) Alert.alert('Connexion impossible', error.message);
    setBusy(false);
  }

  async function signUp() {
    if (!canSubmit) return;
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      Alert.alert('Création impossible', error.message);
    } else if (!data.session) {
      setMessage('Compte créé. Vérifie ton email, puis reviens ici pour te connecter.');
    } else {
      setMessage('Compte SportEvolve créé.');
    }
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.authWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.brandLarge}>SPORT<Text style={styles.brandAccent}>EVOLVE</Text></Text>
          <Text style={styles.authEyebrow}>V1 · PREMIÈRE CONNEXION</Text>
          <Text style={styles.authTitle}>Ta mémoire sportive commence ici.</Text>
          <Text style={styles.authSubtitle}>Un seul compte peut déjà gérer Gregorio et Morgane. Nous pourrons ajouter un second accès utilisateur plus tard.</Text>

          <View style={styles.authCard}>
            <Text style={styles.inputLabel}>EMAIL</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="ton@email.com"
              placeholderTextColor="#56616c"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={styles.input}
            />

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>MOT DE PASSE</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="6 caractères minimum"
              placeholderTextColor="#56616c"
              secureTextEntry
              autoCapitalize="none"
              style={styles.input}
            />

            {message ? <Text style={styles.successMessage}>{message}</Text> : null}

            <Pressable disabled={!canSubmit} onPress={() => void signIn()} style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}>
              {busy ? <ActivityIndicator color="#0c1009" /> : <Text style={styles.primaryButtonText}>Se connecter</Text>}
            </Pressable>
            <Pressable disabled={!canSubmit} onPress={() => void signUp()} style={[styles.secondaryButton, !canSubmit && styles.buttonDisabled]}>
              <Text style={styles.secondaryButtonText}>Créer le compte</Text>
            </Pressable>
          </View>

          <Text style={styles.authFoot}>Les données SportEvolve seront stockées dans Supabase et protégées par les règles RLS de ton compte.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <SafeAreaView style={[styles.safe, styles.loadingScreen]}>
      <ActivityIndicator color="#b7d400" size="large" />
      <Text style={styles.loadingLabel}>{label}</Text>
    </SafeAreaView>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return <View style={styles.statusItem}><Text style={styles.statusLabel}>{label}</Text><Text style={styles.statusValue}>{value}</Text></View>;
}

function Macro({ label, value }: { label: string; value: string }) {
  return <View style={styles.macro}><Text style={styles.macroLabel}>{label}</Text><Text style={styles.macroValue}>{value}</Text></View>;
}

function formatNumber(value: number) {
  return String(value).replace('.', ',');
}

function formatDayType(value: string) {
  if (value === 'training') return 'JOUR ENTRAÎNEMENT';
  if (value === 'rest') return 'JOUR REPOS';
  return value.toUpperCase();
}

function formatSex(value: string) {
  if (value === 'male') return 'Homme';
  if (value === 'female') return 'Femme';
  return 'Sexe à renseigner';
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatBirthDate(value: string) {
  return `né(e) le ${new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR')}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090b0f' },
  content: { padding: 18, paddingBottom: 40 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 },
  brand: { color: '#f4f7f9', fontSize: 18, fontWeight: '900', letterSpacing: -0.8 },
  brandLarge: { color: '#f4f7f9', fontSize: 24, fontWeight: '900', letterSpacing: -1.1 },
  brandAccent: { color: '#b7d400' },
  version: { color: '#65717c', fontSize: 8, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  logoutButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#29323a', backgroundColor: '#10151a' },
  logoutText: { color: '#909ba5', fontSize: 10, fontWeight: '800' },
  profileSwitch: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#11161b', borderRadius: 14, padding: 3, borderWidth: 1, borderColor: '#242b33', marginBottom: 26 },
  profileChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11 },
  profileChipActive: { backgroundColor: '#202817' },
  profileChipText: { color: '#6f7a85', fontSize: 11, fontWeight: '800' },
  profileChipTextActive: { color: '#d7e888' },
  eyebrow: { color: '#9ab300', fontWeight: '900', fontSize: 9, letterSpacing: 1.4 },
  title: { color: '#f4f7f9', fontWeight: '900', fontSize: 29, letterSpacing: -1.2, marginTop: 7, maxWidth: 330 },
  subtitle: { color: '#7f8a95', fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 345 },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 22, marginBottom: 26 },
  statusItem: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#222a31' },
  statusLabel: { color: '#6e7882', fontSize: 9, fontWeight: '800' },
  statusValue: { color: '#e8edf1', fontSize: 16, fontWeight: '900', marginTop: 5 },
  sectionTitle: { color: '#e7ecef', fontSize: 15, fontWeight: '900', marginBottom: 9, marginTop: 4 },
  nutritionCard: { padding: 17, borderRadius: 20, backgroundColor: '#141c15', borderWidth: 1, borderColor: '#3a4727', marginBottom: 24 },
  nutritionMode: { color: '#b7d400', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  kcal: { color: '#f4f7f9', fontSize: 34, fontWeight: '900', letterSpacing: -1.4, marginTop: 8 },
  kcalUnit: { color: '#88938e', fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  macroRow: { flexDirection: 'row', gap: 7, marginTop: 15 },
  macro: { flex: 1, padding: 10, borderRadius: 13, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#29312d' },
  macroLabel: { color: '#727e88', fontSize: 8, fontWeight: '800' },
  macroValue: { color: '#f0f3f5', fontSize: 14, fontWeight: '900', marginTop: 4 },
  helper: { color: '#7c878f', fontSize: 10, lineHeight: 15, marginTop: 13 },
  emptyTitle: { color: '#f0f3f5', fontSize: 20, fontWeight: '900', marginTop: 10 },
  card: { padding: 16, borderRadius: 18, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#242c34', marginBottom: 22 },
  cardTag: { color: '#87929c', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  cardTitle: { color: '#eef2f4', fontSize: 17, fontWeight: '900', marginTop: 6 },
  cardText: { color: '#77838e', fontSize: 10, lineHeight: 15, marginTop: 6 },
  foundation: { marginTop: 4, padding: 15, borderRadius: 16, backgroundColor: '#0d1115', borderWidth: 1, borderColor: '#202831' },
  foundationTitle: { color: '#b7d400', fontSize: 12, fontWeight: '900' },
  foundationText: { color: '#6f7b86', fontSize: 9, lineHeight: 14, marginTop: 5 },
  errorCard: { padding: 15, borderRadius: 16, backgroundColor: '#211517', borderWidth: 1, borderColor: '#5a3036', marginBottom: 16 },
  errorTitle: { color: '#f1c9cf', fontSize: 12, fontWeight: '900' },
  errorText: { color: '#b98e95', fontSize: 10, lineHeight: 15, marginTop: 5 },
  primarySmall: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#b7d400' },
  primarySmallText: { color: '#0c1009', fontSize: 10, fontWeight: '900' },
  loadingScreen: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingLabel: { color: '#7f8a95', fontSize: 11, fontWeight: '700' },
  authWrap: { flex: 1 },
  authContent: { flexGrow: 1, padding: 22, justifyContent: 'center', paddingBottom: 40 },
  authEyebrow: { color: '#9ab300', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginTop: 6 },
  authTitle: { color: '#f4f7f9', fontSize: 31, lineHeight: 34, fontWeight: '900', letterSpacing: -1.3, marginTop: 18, maxWidth: 335 },
  authSubtitle: { color: '#7f8a95', fontSize: 11, lineHeight: 17, marginTop: 10, maxWidth: 340 },
  authCard: { marginTop: 28, padding: 17, borderRadius: 20, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#252e36' },
  inputLabel: { color: '#818d98', fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#303a43', backgroundColor: '#0b1014', color: '#f1f4f6', paddingHorizontal: 14, fontSize: 14 },
  primaryButton: { minHeight: 50, borderRadius: 14, backgroundColor: '#b7d400', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  primaryButtonText: { color: '#0c1009', fontWeight: '900', fontSize: 13 },
  secondaryButton: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#303a43', alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  secondaryButtonText: { color: '#d6dde2', fontWeight: '850', fontSize: 12 },
  buttonDisabled: { opacity: 0.45 },
  successMessage: { color: '#c9df69', fontSize: 10, lineHeight: 15, marginTop: 14 },
  authFoot: { color: '#59646e', fontSize: 9, lineHeight: 14, marginTop: 18, textAlign: 'center' },
});
