import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

export function AppNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!session || pathname === '/add') return null;

  const items = [
    { path: '/', label: 'Tableau' },
    { path: '/references', label: 'Références' },
    { path: '/sessions', label: 'Sessions' },
    { path: '/profile', label: 'Profil' },
  ] as const;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.bar}>
        {items.slice(0, 2).map((item) => (
          <NavItem key={item.path} path={item.path} label={item.label} active={pathname === item.path} onPress={() => router.replace(item.path)} />
        ))}

        <Pressable onPress={() => router.push('/add')} style={styles.addButton}>
          <Text style={styles.plus}>＋</Text>
          <Text style={styles.addLabel}>Ajouter</Text>
        </Pressable>

        {items.slice(2).map((item) => (
          <NavItem key={item.path} path={item.path} label={item.label} active={pathname === item.path} onPress={() => router.replace(item.path)} />
        ))}
      </View>
    </View>
  );
}

function NavItem({ label, active, onPress }: { path: string; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.navItem}>
      <View style={[styles.dot, active && styles.dotActive]} />
      <Text numberOfLines={1} style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', zIndex: 100 },
  bar: {
    width: '94%',
    height: 74,
    marginBottom: 8,
    paddingHorizontal: 8,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#2a333b',
    backgroundColor: '#0f1418',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navItem: { flex: 1, minWidth: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent', marginBottom: 5 },
  dotActive: { backgroundColor: '#b7d400' },
  navText: { color: '#6f7b85', fontSize: 7.5, fontWeight: '900' },
  navTextActive: { color: '#d8e789' },
  addButton: {
    width: 68,
    height: 68,
    borderRadius: 24,
    backgroundColor: '#b7d400',
    borderWidth: 5,
    borderColor: '#090b0f',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
  },
  plus: { color: '#0c1009', fontSize: 27, lineHeight: 27 },
  addLabel: { color: '#0c1009', fontSize: 7.5, fontWeight: '900', marginTop: 1 },
});
