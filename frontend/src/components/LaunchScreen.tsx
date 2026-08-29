import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LaunchScreen() {
  const insets = useSafeAreaInsets();
  const brandOpacity = useRef(new Animated.Value(0)).current;
  const ownerProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(brandOpacity, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }),
      Animated.timing(ownerProgress, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== "web" }),
    ]).start();
  }, [brandOpacity, ownerProgress]);

  return <View testID="splash-screen-container" style={styles.root}>
    <Animated.View testID="brand-logo" style={[styles.brandWrap, { opacity: brandOpacity }]}>
      <View style={styles.mark}><Ionicons name="leaf" size={39} color="#0A1F16" /></View>
      <Text style={styles.brand}>KrishiAI</Text>
      <Text style={styles.tagline}>SMART AGRICULTURE ASSISTANT</Text>
    </Animated.View>
    <Animated.View style={[styles.ownerWrap, { bottom: Math.max(insets.bottom, 20) + 28, opacity: ownerProgress, transform: [{ translateY: ownerProgress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      <View style={styles.ownerLine} />
      <Text style={styles.ownerLabel}>OWNER</Text>
      <Text testID="owner-name-display" accessibilityLabel="Owner Akash Choyal" style={styles.ownerName}>Akash Choyal</Text>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A1F16", alignItems: "center", justifyContent: "center" },
  brandWrap: { alignItems: "center", marginBottom: 54 },
  mark: { width: 78, height: 78, borderRadius: 26, backgroundColor: "#B6D084", alignItems: "center", justifyContent: "center", marginBottom: 22 },
  brand: { color: "#F4F1E1", fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -1 },
  tagline: { color: "#8B9E90", fontSize: 10, lineHeight: 16, fontWeight: "700", letterSpacing: 2.1, marginTop: 7 },
  ownerWrap: { position: "absolute", alignItems: "center" },
  ownerLine: { width: 28, height: 1, backgroundColor: "#B6D084", marginBottom: 14 },
  ownerLabel: { color: "#8B9E90", fontSize: 9, fontWeight: "700", letterSpacing: 2.4, marginBottom: 7 },
  ownerName: { color: "#F4F1E1", fontSize: 18, lineHeight: 24, fontStyle: "italic", letterSpacing: 2 },
});