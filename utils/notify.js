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

export default showAlert;
