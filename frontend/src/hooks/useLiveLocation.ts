import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/src/context/AppContext";

export type LiveLocationStatus = "idle" | "locating" | "active" | "denied" | "error";

export function useLiveLocation(onUpdated: () => Promise<void>) {
  const { user, updateLocation } = useApp();
  const attempted = useRef(false);
  const [status, setStatus] = useState<LiveLocationStatus>(user?.latitude != null ? "active" : "idle");

  const locate = useCallback(async () => {
    setStatus("locating");
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setStatus("denied");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await updateLocation(position.coords.latitude, position.coords.longitude);
      await onUpdated();
      setStatus("active");
    } catch {
      setStatus("error");
    }
  }, [onUpdated, updateLocation]);

  useEffect(() => {
    if (user?.user_id && !attempted.current) {
      attempted.current = true;
      void locate();
    }
  }, [locate, user?.user_id]);

  return { status, locate };
}