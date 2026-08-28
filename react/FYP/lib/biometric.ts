
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

const LOGIN_2FA_KEY = "loginBiometric";

export type BioResult = "success" | "failed" | "unavailable";


export async function biometricCheck(promptMessage: string): Promise<BioResult> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) return "unavailable";
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: false, // allow device PIN/pattern as a fallback
    });
    return res.success ? "success" : "failed";
  } catch {
    return "unavailable";
  }
}

export async function isLoginBiometricEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(LOGIN_2FA_KEY)) === "true";
}

export async function setLoginBiometricEnabled(on: boolean): Promise<void> {
  await AsyncStorage.setItem(LOGIN_2FA_KEY, on ? "true" : "false");
}
