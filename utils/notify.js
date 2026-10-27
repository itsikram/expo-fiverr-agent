import { Alert, Platform } from "react-native";

/**
 * Alert.alert is a no-op on react-native-web, so failures shown with it were
 * invisible in the web build. Fall back to the browser dialog there.
 */
export const showAlert = (title, message = "") => {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
};

/**
 * Ask for confirmation; resolves true when the user agrees.
 */
export const showConfirm = (title, message = "", confirmText = "OK") => {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return Promise.resolve(
        window.confirm(message ? `${title}\n\n${message}` : title),
      );
    }
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: confirmText, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
};

export default showAlert;
