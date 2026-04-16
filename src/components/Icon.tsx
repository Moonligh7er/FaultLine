import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
}

export default function Icon({ name, size = 24, color = COLORS.text }: IconProps) {
  return (
    <MaterialCommunityIcons
      name={name as any}
      size={size}
      color={color}
    />
  );
}
