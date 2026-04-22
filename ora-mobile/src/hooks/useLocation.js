import { useState, useEffect } from "react";
import * as Location from "expo-location";

export function useLocation() {
  const [city, setCity] = useState(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      const coords = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [place] = await Location.reverseGeocodeAsync({
        latitude: coords.coords.latitude,
        longitude: coords.coords.longitude,
      });

      if (place?.city) setCity(place.city);
      else if (place?.region) setCity(place.region);
    })();
  }, []);

  return city;
}
