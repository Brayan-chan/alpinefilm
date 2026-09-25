import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "../theme/colors";
import { styles } from "../theme/styles";
export function Button({
  title,
  onPress,
  busy = false,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || disabled, busy }}
      disabled={busy || disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primary,
        { paddingHorizontal: 18, paddingVertical: 14 },
        secondary && {
          backgroundColor: colors.panel,
          borderColor: colors.border,
          borderWidth: 1,
        },
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
      ]}
    >
      {busy ? (
        <ActivityIndicator
          accessibilityLabel="Procesando"
          color={secondary ? colors.accent : "#FFFFFF"}
        />
      ) : (
        <Text
          style={[
            styles.primaryText,
            { textAlign: "center" },
            secondary && { color: colors.text },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  secret = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  secret?: boolean;
  numeric?: boolean;
}) {
  const [focus, setFocus] = useState(false),
    [visible, setVisible] = useState(false);
  const multiline = label === "Descripción";
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={{ position: "relative" }}>
        <TextInput
          accessibilityLabel={label}
          style={[
            styles.input,
            {
              borderColor: focus ? colors.accent : colors.border,
              paddingRight: secret ? 54 : 16,
            },
            multiline && {
              minHeight: 104,
              textAlignVertical: "top",
              paddingTop: 16,
            },
          ]}
          placeholderTextColor={colors.muted}
          autoCapitalize={secret || label === "Usuario" ? "none" : "sentences"}
          autoCorrect={!secret && label !== "Usuario"}
          secureTextEntry={secret && !visible}
          multiline={multiline}
          keyboardType={numeric ? "numeric" : "default"}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              visible ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            onPress={() => setVisible(!visible)}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              width: 50,
              height: 54,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={21}
              color={colors.secondary}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
export function ErrorText({ message }: { message?: string }) {
  return message ? (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.error}
    >
      {message}
    </Text>
  ) : null;
}
export function Page({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: 24,
            paddingBottom: 40,
            flexGrow: 1,
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={onBack}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.panel,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="arrow-back" size={23} color={colors.text} />
            </Pressable>
          ) : null}
          {title ? (
            <Text style={[styles.homeTitle, { marginBottom: 20 }]}>
              {title}
            </Text>
          ) : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Loading() {
  return (
    <View
      style={[
        styles.safe,
        { justifyContent: "center", alignItems: "center", gap: 16 },
      ]}
    >
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.cardMeta}>Preparando tu biblioteca…</Text>
    </View>
  );
}
