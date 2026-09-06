import { logUserActivity } from "./adminService";

const normalizeActivityType = (value) =>
  String(value || "unknown")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const trackUserActivity = async (token, role, activity = {}) => {
  if (!token) {
    return false;
  }

  const normalizedRole = String(role || "user").toLowerCase();
  if (normalizedRole.includes("admin")) {
    return false;
  }

  try {
    const payload = {
      ...activity,
      activityType: normalizeActivityType(
        activity.activityType || activity.type,
      ),
    };
    await logUserActivity(token, payload);
    return true;
  } catch (error) {
    return false;
  }
};
