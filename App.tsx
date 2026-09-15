import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from './src/api/client';
import { clearSession, saveSession } from './src/auth/session';
import { colors } from './src/theme/colors';
import type { Movie, Session } from './src/types/api';

const movies: Movie[] = [
  { id: 'demo-1', title: 'Horizonte remoto', description: 'Una expedición descubre una señal imposible en los límites del sistema solar.', year: 2026, durationSeconds: 6420, genres: ['Ciencia ficción', 'Aventura'], posterUrl: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=900', progress: 0.42 },
  { id: 'demo-2', title: 'Después de la lluvia', description: 'Dos desconocidos reconstruyen sus vidas durante un verano inolvidable.', year: 2025, durationSeconds: 5880, genres: ['Drama'], posterUrl: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=900' },
  { id: 'demo-3', title: 'Ruta nocturna', description: 'Un viaje por carretera se convierte en una carrera contra el tiempo.', year: 2024, durationSeconds: 7020, genres: ['Suspenso'], posterUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=900' },
];

type Screen = 'login' | 'home' | 'details' | 'profile';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const [selected, setSelected] = useState(movies[0]);
  const [session, setSession] = useState<Session | null>(null);
  const signIn = (value: Session) => { setSession(value); setScreen('home'); };
  const openMovie = (movie: Movie) => { setSelected(movie); setScreen('details'); };

  return (
    <View style={styles.app}>
      <StatusBar style="light" />
      {screen === 'login' && <Login onSignedIn={signIn} />}
      {screen === 'home' && <Home onMovie={openMovie} onProfile={() => setScreen('profile')} />}
      {screen === 'details' && <Details movie={selected} onBack={() => setScreen('home')} />}
      {screen === 'profile' && <Profile username={session?.user.username ?? 'Invitado'} onBack={() => setScreen('home')} onLogout={async () => { await clearSession(); setSession(null); setScreen('login'); }} />}
    </View>
  );
}

function Login({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const login = async () => {
    if (!username.trim() || !password) return setError('Escribe tu usuario y contraseña.');
    setLoading(true); setError(undefined);
    try { const session = await api.login(username.trim(), password); await saveSession(session); onSignedIn(session); }
    catch { setError('No se pudo conectar. Comprueba Tailscale y que la API esté encendida.'); }
    finally { setLoading(false); }
  };
  const demo = () => onSignedIn({ accessToken: 'demo', refreshToken: 'demo', user: { id: 'demo', username: 'Brayan', role: 'admin' } });

  return <LinearGradient colors={['#081019', '#111827', '#050a10']} style={styles.flex}>
    <SafeAreaView style={styles.login}>
      <View style={styles.logo}><View style={styles.play} /></View>
      <Text style={styles.brand}>ALPINEFILM</Text>
      <Text style={styles.loginTitle}>Tu cine, en tu servidor.</Text>
      <Text style={styles.copy}>Conecta con tu biblioteca privada y continúa viendo desde cualquier lugar.</Text>
      <View style={styles.form}>
        <Text style={styles.label}>Usuario</Text>
        <TextInput autoCapitalize="none" placeholder="Tu usuario" placeholderTextColor={colors.muted} style={styles.input} value={username} onChangeText={setUsername} />
        <Text style={styles.label}>Contraseña</Text>
        <TextInput placeholder="••••••••" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} value={password} onChangeText={setPassword} onSubmitEditing={login} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable disabled={loading} onPress={login} style={styles.primary}>{loading ? <ActivityIndicator color="#06120d" /> : <Text style={styles.primaryText}>Entrar</Text>}</Pressable>
        <Pressable onPress={demo} style={styles.demo}><Text style={styles.demoText}>Explorar diseño sin backend</Text></Pressable>
      </View>
      <Text style={styles.privateText}>Conexión privada mediante Tailscale</Text>
    </SafeAreaView>
  </LinearGradient>;
}

function Home({ onMovie, onProfile }: { onMovie: (movie: Movie) => void; onProfile: () => void }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => movies.filter(m => m.title.toLowerCase().includes(query.toLowerCase())), [query]);
  return <SafeAreaView style={styles.safe}><FlatList data={filtered} numColumns={2} keyExtractor={m => m.id} columnWrapperStyle={styles.row} contentContainerStyle={styles.catalog}
    ListHeaderComponent={<>
      <View style={styles.header}><View><Text style={styles.eyebrow}>BIBLIOTECA PRIVADA</Text><Text style={styles.homeTitle}>¿Qué vemos hoy?</Text></View><Pressable onPress={onProfile} style={styles.avatar}><Text style={styles.avatarText}>B</Text></Pressable></View>
      <TextInput placeholder="Buscar una película" placeholderTextColor={colors.muted} style={styles.search} value={query} onChangeText={setQuery} />
      <Pressable onPress={() => onMovie(movies[0])} style={styles.hero}><Image source={{ uri: movies[0].posterUrl }} style={StyleSheet.absoluteFill} /><LinearGradient colors={['transparent', 'rgba(5,10,16,.97)']} style={StyleSheet.absoluteFill} /><View style={styles.heroContent}><Text style={styles.eyebrow}>CONTINUAR VIENDO</Text><Text style={styles.heroTitle}>{movies[0].title}</Text><View style={styles.track}><View style={styles.fill} /></View><Text style={styles.cardMeta}>42% · 1 h 47 min</Text></View></Pressable>
      <Text style={styles.sectionTitle}>Disponibles</Text>
    </>}
    renderItem={({ item }) => <Pressable onPress={() => onMovie(item)} style={styles.card}><Image source={{ uri: item.posterUrl }} style={styles.poster} /><Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardMeta}>{item.year} · {Math.round(item.durationSeconds / 60)} min</Text></Pressable>}
    ListEmptyComponent={<Text style={styles.copy}>No encontramos películas con ese nombre.</Text>} />
  </SafeAreaView>;
}

function Details({ movie, onBack }: { movie: Movie; onBack: () => void }) {
  return <ScrollView style={styles.safe} contentContainerStyle={styles.details}><View style={styles.detailsHero}><Image source={{ uri: movie.posterUrl }} style={StyleSheet.absoluteFill} /><LinearGradient colors={['rgba(5,10,16,.05)', colors.background]} style={StyleSheet.absoluteFill} /><SafeAreaView><Back onPress={onBack} /></SafeAreaView></View><Text style={styles.detailsTitle}>{movie.title}</Text><Text style={styles.detailsMeta}>{movie.year} · {Math.round(movie.durationSeconds / 60)} min · {movie.genres.join(' / ')}</Text><Text style={styles.description}>{movie.description}</Text><Pressable style={[styles.primary, styles.sideMargin]}><Text style={styles.primaryText}>▶ Reproducir</Text></Pressable><Info title="Reproductor preparado" body={`Usará /api/v1/movies/${movie.id}/stream cuando conectemos el backend.`} /></ScrollView>;
}

function Profile({ username, onBack, onLogout }: { username: string; onBack: () => void; onLogout: () => void }) {
  return <SafeAreaView style={styles.safe}><Back onPress={onBack} /><View style={styles.profileAvatar}><Text style={styles.profileLetter}>{username[0]?.toUpperCase()}</Text></View><Text style={[styles.detailsTitle, styles.center]}>{username}</Text><Text style={[styles.detailsMeta, styles.center]}>Conectado a AlpineFilm</Text><Info title="Servidor privado" body={api.baseUrl} /><Pressable onPress={onLogout} style={styles.logout}><Text style={styles.logoutText}>Cerrar sesión</Text></Pressable></SafeAreaView>;
}

function Back({ onPress }: { onPress: () => void }) { return <Pressable accessibilityLabel="Volver" onPress={onPress} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>; }
function Info({ title, body }: { title: string; body: string }) { return <View style={styles.info}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoText}>{body}</Text></View>; }

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.background },
  login: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 }, logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  play: { marginLeft: 4, width: 0, height: 0, borderTopWidth: 9, borderBottomWidth: 9, borderLeftWidth: 15, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#06120d' },
  brand: { color: colors.accent, fontSize: 14, fontWeight: '800', letterSpacing: 2.4 }, loginTitle: { color: colors.text, fontSize: 38, lineHeight: 44, fontWeight: '800', marginTop: 12, maxWidth: 330 },
  copy: { color: colors.secondary, fontSize: 16, lineHeight: 24, marginTop: 12 }, form: { marginTop: 28 }, label: { color: colors.secondary, fontWeight: '700', fontSize: 13, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: colors.panel, color: colors.text, borderWidth: 1, borderColor: colors.border, height: 54, borderRadius: 14, paddingHorizontal: 16, fontSize: 16 }, error: { color: '#fb7185', lineHeight: 20, marginTop: 14 },
  primary: { backgroundColor: colors.accent, height: 54, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 20 }, primaryText: { color: '#06120d', fontWeight: '800', fontSize: 16 }, demo: { height: 48, justifyContent: 'center', alignItems: 'center' }, demoText: { color: colors.secondary, fontWeight: '700' }, privateText: { color: colors.muted, textAlign: 'center', fontSize: 12, marginTop: 24 },
  catalog: { padding: 20, paddingBottom: 48 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 20 }, eyebrow: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 }, homeTitle: { color: colors.text, fontSize: 29, fontWeight: '800', marginTop: 5 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }, avatarText: { color: colors.accent, fontWeight: '900', fontSize: 17 },
  search: { height: 50, borderRadius: 15, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 16, fontSize: 15, marginBottom: 20 }, hero: { height: 270, borderRadius: 22, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: colors.panel }, heroContent: { padding: 20 }, heroTitle: { color: colors.text, fontSize: 27, fontWeight: '800', marginTop: 6 }, track: { height: 4, backgroundColor: 'rgba(255,255,255,.25)', borderRadius: 4, marginTop: 16 }, fill: { width: '42%', height: 4, backgroundColor: colors.accent, borderRadius: 4 },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '800', marginTop: 28, marginBottom: 14 }, row: { gap: 14 }, card: { flex: 1, maxWidth: '48%', marginBottom: 22 }, poster: { width: '100%', aspectRatio: .7, borderRadius: 16, backgroundColor: colors.panel }, cardTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 10 }, cardMeta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  details: { paddingBottom: 50 }, detailsHero: { height: 410, marginBottom: -30 }, back: { margin: 18, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(5,10,16,.75)', alignItems: 'center', justifyContent: 'center' }, backText: { color: colors.text, fontSize: 36, lineHeight: 39, marginTop: -3 }, detailsTitle: { color: colors.text, fontSize: 31, fontWeight: '900', paddingHorizontal: 22 }, detailsMeta: { color: colors.accent, fontSize: 13, fontWeight: '700', paddingHorizontal: 22, marginTop: 8 }, description: { color: colors.secondary, fontSize: 16, lineHeight: 25, paddingHorizontal: 22, marginTop: 20 }, sideMargin: { marginHorizontal: 22 },
  info: { margin: 22, padding: 18, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }, infoTitle: { color: colors.text, fontSize: 15, fontWeight: '800' }, infoText: { color: colors.secondary, fontSize: 13, lineHeight: 20, marginTop: 6 },
  profileAvatar: { alignSelf: 'center', width: 90, height: 90, borderRadius: 45, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginTop: 35, marginBottom: 22 }, profileLetter: { color: '#06120d', fontSize: 35, fontWeight: '900' }, center: { textAlign: 'center' }, logout: { marginHorizontal: 22, height: 52, borderRadius: 14, borderWidth: 1, borderColor: '#7f1d1d', alignItems: 'center', justifyContent: 'center' }, logoutText: { color: '#fda4af', fontWeight: '800' },
});
