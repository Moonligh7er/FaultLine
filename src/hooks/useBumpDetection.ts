import { useEffect, useRef, useState } from 'react';
import { Accelerometer } from 'expo-sensors';
import { Alert } from 'react-native';

interface BumpDetectionOptions {
  threshold?: number;
  cooldownMs?: number;
  enabled?: boolean;
  onConfirmedBump?: () => void;
}

export function useBumpDetection({
  threshold = 2.5,
  cooldownMs = 10000,
  enabled = true,
  onConfirmedBump,
}: BumpDetectionOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [lastBump, setLastBump] = useState<Date | null>(null);
  const lastTriggerRef = useRef<number>(0);
  const subscriptionRef = useRef<ReturnType<typeof Accelerometer.addListener> | null>(null);

  // Track recent readings to filter false positives
  const readingsRef = useRef<number[]>([]);
  const READINGS_WINDOW = 10; // Look at last 10 readings
  const SUSTAINED_THRESHOLD = 1.5; // Lower threshold that must be sustained

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }
    start();
    return () => stop();
  }, [enabled, threshold]);

  const start = () => {
    Accelerometer.setUpdateInterval(100);

    subscriptionRef.current = Accelerometer.addListener((data) => {
      const { x, y, z } = data;
      const totalG = Math.sqrt(x * x + y * y + z * z);
      const impactForce = Math.abs(totalG - 1);

      // Track rolling window of readings
      readingsRef.current.push(impactForce);
      if (readingsRef.current.length > READINGS_WINDOW) {
        readingsRef.current.shift();
      }

      // Only trigger if we see a spike AND recent readings show sustained roughness
      // This filters out single jolts (phone drops, door closes)
      if (impactForce > threshold) {
        const now = Date.now();
        if (now - lastTriggerRef.current > cooldownMs) {
          // Check if at least 3 of last 10 readings were above sustained threshold
          const roughReadings = readingsRef.current.filter((r) => r > SUSTAINED_THRESHOLD);
          if (roughReadings.length >= 3) {
            lastTriggerRef.current = now;
            promptUser();
          }
        }
      }
    });

    setIsListening(true);
  };

  const promptUser = () => {
    Alert.alert(
      'Bump Detected!',
      'We detected a possible road hazard. Would you like to report it?',
      [
        { text: 'Not a pothole', style: 'cancel' },
        {
          text: 'Yes, report it',
          onPress: () => {
            setLastBump(new Date());
            onConfirmedBump?.();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const stop = () => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    setIsListening(false);
  };

  return { isListening, lastBump, start, stop };
}
