import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

interface VoiceCommandOptions {
  onCommand?: (command: string) => void;
  triggerPhrases?: string[];
}

const DEFAULT_TRIGGERS = ['report pothole', 'report issue', 'new report', 'fix this'];

export function useVoiceCommand({
  onCommand,
  triggerPhrases = DEFAULT_TRIGGERS,
}: VoiceCommandOptions = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    checkAvailability();
  }, []);

  const checkAvailability = async () => {
    const result = await ExpoSpeechRecognitionModule.isRecognitionAvailable();
    setIsAvailable(result);
  };

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results?.[0]?.transcript?.toLowerCase() || '';
    setTranscript(text);

    // Check if any trigger phrase was spoken
    const matchedTrigger = triggerPhrases.find((phrase) =>
      text.includes(phrase.toLowerCase())
    );

    if (matchedTrigger) {
      onCommand?.(matchedTrigger);
      stopListening();
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setError(event.error || 'Speech recognition error');
    setIsListening(false);
  });

  const startListening = useCallback(async () => {
    if (!isAvailable) {
      setError('Speech recognition not available on this device');
      return;
    }

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError('Microphone permission not granted');
      return;
    }

    setTranscript('');
    setError(null);

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
    });
  }, [isAvailable]);

  const stopListening = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
    setIsListening(false);
  }, []);

  return {
    isListening,
    transcript,
    error,
    isAvailable,
    startListening,
    stopListening,
  };
}
