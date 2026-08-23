import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Athlete = 'Gregorio' | 'Morgane';

const nutrition = {
  Gregorio: { training: 2750, rest: 2400, protein: 170, carbs: 360, fat: 70 },
  Morgane: { training: null, rest: null, protein: null, carbs: null, fat: null },
} as const;

export default function HomeScreen() {
  const [athlete, setAthlete] = useState<Athlete>('Gregorio');
  const target = useMemo(() => nutrition[athlete], [athlete]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <View>
            <Text style={styles.brand}>SPORT<Text style={styles.brandAccent}>EVOLVE</Text></Text>
            <Text style={styles.version}>V1 FOUNDATION</Text>
          </View>
          <View style={styles.profileSwitch}>
            {(['Gregorio', 'Morgane'] as Athlete[]).map((name) => (
              <Pressable key={name} onPress={() => setAthlete(name)} style={[styles.profileChip, athlete === name && styles.profileChipActive]}>
                <Text style={[styles.profileChipText, athlete === name && styles.profileChipTextActive]}>{name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.eyebrow}>TABLEAU DE BORD</Text>
        <Text style={styles.title}>Voici où en est ta semaine.</Text>
        <Text style={styles.subtitle}>La première vraie base mobile de SportEvolve. Les cartes seront alimentées par Supabase.</Text>

        <View style={styles.statusRow}>
          <View style={styles.statusItem}><Text style={styles.statusLabel}>Séances</Text><Text style={styles.statusValue}>—</Text></View>
          <View style={styles.statusItem}><Text style={styles.statusLabel}>Charge</Text><Text style={styles.statusValue}>—</Text></View>
          <View style={styles.statusItem}><Text style={styles.statusLabel}>Cycle</Text><Text style={styles.statusValue}>—</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Nutrition aujourd’hui</Text>
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionMode}>JOUR ENTRAÎNEMENT · APERÇU V1</Text>
          {target.training ? (
            <>
              <Text style={styles.kcal}>{target.training}<Text style={styles.kcalUnit}> kcal</Text></Text>
              <View style={styles.macroRow}>
                <Macro label="Protéines" value={`${target.protein} g`} />
                <Macro label="Glucides" value={`${target.carbs} g`} />
                <Macro label="Lipides" value={`${target.fat} g`} />
              </View>
              <Text style={styles.helper}>Repos : {target.rest} kcal · La cible deviendra dynamique selon profil, charge et historique réel.</Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>Profil à compléter</Text>
              <Text style={styles.helper}>Âge, taille, poids et objectif seront nécessaires avant toute cible calories/macros.</Text>
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Prochaine séance</Text>
        <View style={styles.card}>
          <Text style={styles.cardTag}>PROGRAMME</Text>
          <Text style={styles.cardTitle}>Aucune séance planifiée</Text>
          <Text style={styles.cardText}>Les séances coachées et manuelles arriveront ici depuis la base V1.</Text>
        </View>

        <Text style={styles.sectionTitle}>Progression</Text>
        <View style={styles.card}>
          <Text style={styles.cardTag}>RÉFÉRENCES</Text>
          <Text style={styles.cardTitle}>PR, e1RM, benchmarks & Hyrox</Text>
          <Text style={styles.cardText}>Le schéma V1 distingue déjà performances réelles, séries de référence et estimations.</Text>
        </View>

        <View style={styles.foundation}>
          <Text style={styles.foundationTitle}>Socle V1 prêt</Text>
          <Text style={styles.foundationText}>Expo mobile · Supabase PostgreSQL · RLS · sessions partagées · nutrition · structure Apple Health / Health Connect.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return <View style={styles.macro}><Text style={styles.macroLabel}>{label}</Text><Text style={styles.macroValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090b0f' },
  content: { padding: 18, paddingBottom: 40 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 12 },
  brand: { color: '#f4f7f9', fontSize: 18, fontWeight: '900', letterSpacing: -0.8 },
  brandAccent: { color: '#b7d400' },
  version: { color: '#65717c', fontSize: 8, fontWeight: '800', letterSpacing: 1.2, marginTop: 2 },
  profileSwitch: { flexDirection: 'row', backgroundColor: '#11161b', borderRadius: 14, padding: 3, borderWidth: 1, borderColor: '#242b33' },
  profileChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11 },
  profileChipActive: { backgroundColor: '#202817' },
  profileChipText: { color: '#6f7a85', fontSize: 10, fontWeight: '800' },
  profileChipTextActive: { color: '#d7e888' },
  eyebrow: { color: '#9ab300', fontWeight: '900', fontSize: 9, letterSpacing: 1.4 },
  title: { color: '#f4f7f9', fontWeight: '900', fontSize: 29, letterSpacing: -1.2, marginTop: 7, maxWidth: 310 },
  subtitle: { color: '#7f8a95', fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 345 },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 22, marginBottom: 26 },
  statusItem: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: '#10151a', borderWidth: 1, borderColor: '#222a31' },
  statusLabel: { color: '#6e7882', fontSize: 9, fontWeight: '800' },
  statusValue: { color: '#e8edf1', fontSize: 17, fontWeight: '900', marginTop: 5 },
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
});
