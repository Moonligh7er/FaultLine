import * as Location from 'expo-location';
import { ReportLocation } from '../types';

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getCurrentLocation(): Promise<ReportLocation | null> {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) return null;

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });

  const [geocode] = await Location.reverseGeocodeAsync({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  });

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    address: geocode
      ? `${geocode.streetNumber || ''} ${geocode.street || ''}`.trim() || undefined
      : undefined,
    city: geocode?.city || undefined,
    state: geocode?.region || undefined,
    zip: geocode?.postalCode || undefined,
  };
}

export async function geocodeAddress(address: string): Promise<ReportLocation | null> {
  const results = await Location.geocodeAsync(address);
  if (results.length === 0) return null;

  const { latitude, longitude } = results[0];
  const [geocode] = await Location.reverseGeocodeAsync({ latitude, longitude });

  return {
    latitude,
    longitude,
    address,
    city: geocode?.city || undefined,
    state: geocode?.region || undefined,
    zip: geocode?.postalCode || undefined,
  };
}
